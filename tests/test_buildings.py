import json
from pathlib import Path
import subprocess
import time
from types import SimpleNamespace

import pytest
from shapely.geometry import MultiPolygon, Polygon, box, mapping

from backend import buildings
from backend.config import Bounds, Settings
from backend.geodata import Geography
from backend.overpass import Downloader


BOUNDS = [0, 0, 10, 10]


def record(ident, geom, **properties):
    return {'type': 'Feature', 'id': ident, 'geometry': mapping(geom), 'properties': properties}


def response(*features, bounds=BOUNDS):
    return {'cache_version': buildings.CACHE_VERSION, 'complete': True, 'bounds': bounds,
            'release': '2026-08-19.0', 'fetched_at': time.time(), 'count': len(features),
            'features': list(features)}


def merge(existing, *extra):
    return buildings.supplement(existing, response(*extra), lambda x, y: (x, y), box(*BOUNDS))


def test_fills_empty_neighbourhood_and_preserves_osm_height():
    osm = [('building', box(1, 1, 2, 2), {'height': '12'})]
    result, counts = merge(osm, record('same', box(1.05, 1, 2.05, 2), height=8),
                           record('new', box(4, 4, 5, 5), height=6.5))
    assert len(result) == 2
    assert result[0] == osm[0]
    assert result[1][2]['height'] == '6.5'
    assert counts['duplicate_buildings'] == 1
    assert counts['added_buildings'] == 1


def test_shared_edges_do_not_remove_neighbouring_houses():
    result, counts = merge([('building', box(1, 1, 2, 2), {})], record('next', box(2, 1, 3, 2)))
    assert len(result) == 2
    assert counts['duplicate_buildings'] == 0


def test_source_id_matches_shifted_footprint_and_enriches_missing_height():
    result, counts = merge([('building', box(1, 1, 2, 2), {'_osm_id': 'way/42'})],
                           record('same', box(2.1, 1, 3.1, 2), height=7,
                                  sources=[{'dataset': 'OpenStreetMap', 'record_id': 'https://www.openstreetmap.org/way/42'}]))
    assert len(result) == 1
    assert result[0][1].equals(box(1, 1, 2, 2))
    assert result[0][2]['height'] == '7.0'
    assert counts['height_enriched_buildings'] == 1


def test_osm_parts_do_not_get_duplicate_parent_roof():
    result, counts = merge([('building', box(1, 1, 2, 2), {'height': '4'}),
                            ('building', box(2, 1, 3, 2), {'height': '8'})],
                           record('parent', box(1, 1, 3, 2), height=6))
    assert len(result) == 2
    assert [t['height'] for k, g, t in result] == ['4', '8']
    assert counts['duplicate_buildings'] == 1


def test_clipping_preserves_courtyard_and_separate_polygons():
    courtyard = Polygon([(1, 1), (4, 1), (4, 4), (1, 4)], [[(2, 2), (3, 2), (3, 3), (2, 3)]])
    result, counts = merge([], record('court', courtyard),
                           record('parts', MultiPolygon([box(5, 5, 6, 6), box(7, 7, 8, 8)])),
                           record('edge', box(9, 1, 11, 2)), record('outside', box(12, 1, 13, 2)))
    assert len(result) == 3
    assert len(result[0][1].interiors) == 1
    assert len(result[1][1].geoms) == 2
    assert result[2][1].bounds == (9, 1, 10, 2)
    assert counts['outside_buildings'] == 1


def test_repeated_ids_and_unknown_heights():
    extra = record('one', box(1, 1, 2, 2), height=-1)
    result, counts = merge([], extra, extra, record('levels', box(4, 4, 5, 5), num_floors=2))
    assert len(result) == 2
    assert 'height' not in result[0][2]
    assert result[1][2]['building:levels'] == '2.0'
    assert counts['fallback_height_buildings'] == 1


def test_complete_download_cached_without_second_network_request(tmp_path, monkeypatch):
    calls = []
    def run(args, **kwargs):
        calls.append(args)
        assert kwargs['timeout'] == buildings.DOWNLOAD_TIMEOUT
        Path(args[-1]).write_text(json.dumps(response(record('one', box(1, 1, 2, 2)))))
        return SimpleNamespace(returncode=0)
    monkeypatch.setattr(buildings.subprocess, 'run', run)
    first = buildings.download(BOUNDS, tmp_path, lambda *a: None)
    assert buildings.download(BOUNDS, tmp_path, lambda *a: None) == first
    assert len(calls) == 1
    assert not list(tmp_path.glob('.buildings-*'))


@pytest.mark.parametrize('failure', ['partial', 'timeout', 'error'])
def test_failed_download_never_publishes_partial_cache(tmp_path, monkeypatch, failure):
    def run(args, **kwargs):
        Path(args[-1]).write_text(json.dumps(response(record('one', box(1, 1, 2, 2)))))
        if failure == 'timeout':
            raise subprocess.TimeoutExpired(args, kwargs['timeout'])
        if failure == 'error':
            return SimpleNamespace(returncode=1, stderr='network failure')
        Path(args[-1]).write_text('{"features": []}')
        return SimpleNamespace(returncode=0)
    monkeypatch.setattr(buildings.subprocess, 'run', run)
    with pytest.raises(ValueError):
        buildings.download(BOUNDS, tmp_path, lambda *a: None)
    assert not list(tmp_path.iterdir())


def test_corrupt_cache_refetched(tmp_path, monkeypatch):
    calls = []
    def run(args, **kwargs):
        calls.append(args)
        Path(args[-1]).write_text(json.dumps(response()))
        return SimpleNamespace(returncode=0)
    monkeypatch.setattr(buildings.subprocess, 'run', run)
    buildings.download(BOUNDS, tmp_path, lambda *a: None)
    next(tmp_path.glob('*.json')).write_text('{corrupt')
    buildings.download(BOUNDS, tmp_path, lambda *a: None)
    assert len(calls) == 2


def test_combined_default_adds_buildings_to_real_geography_pipeline(monkeypatch):
    s = Settings(bounds=Bounds(west=0, south=0, east=0.01, north=0.01))
    monkeypatch.setattr(Downloader, 'download', lambda *a: {'elements': []})
    monkeypatch.setattr(buildings, 'download', lambda *a: response(record('house', box(.002, .002, .004, .004), height=6)))
    features, meta = Geography(s).vectors(lambda *a: None)
    assert s.building_source == 'combined'
    assert len(features) == 1 and features[0][0] == 'building'
    assert features[0][1].bounds[0] > s.frame_width
    assert meta['buildings']['added_buildings'] == 1


@pytest.mark.parametrize('s', [Settings(building_source='osm'), Settings(buildings=False)])
def test_explicit_osm_or_disabled_buildings_never_download_overture(monkeypatch, s):
    monkeypatch.setattr(Downloader, 'download', lambda *a: {'elements': []})
    def forbidden(*args):
        pytest.fail('Overture must not be requested')
    monkeypatch.setattr(buildings, 'download', forbidden)
    assert Geography(s).vectors(lambda *a: None)[0] == []


def test_source_failure_does_not_silently_fall_back_to_sparse_osm(monkeypatch):
    monkeypatch.setattr(Downloader, 'download', lambda *a: {'elements': []})
    def unavailable(*args):
        raise ValueError('building source unavailable')
    monkeypatch.setattr(buildings, 'download', unavailable)
    with pytest.raises(ValueError, match='building source unavailable'):
        Geography(Settings()).vectors(lambda *a: None)
