"""Supplement live OSM with full-resolution Overture building footprints.

Downloads run in a bounded subprocess because Arrow's native network calls
cannot be cancelled reliably in the model-generation thread. Only a complete,
validated area is committed to the cache; a failed download never becomes an
apparently successful, sparsely populated model.
"""
import hashlib
import json
import logging
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

from shapely import STRtree, make_valid
from shapely.geometry import MultiPolygon, Polygon, box, mapping, shape
from shapely.ops import transform, unary_union

from .paths import RESOURCE_ROOT as ROOT, worker_command, subprocess_options
CACHE_TTL = 7 * 86400
DOWNLOAD_TIMEOUT = 240
MAX_BUILDINGS = 50000
CACHE_VERSION = 2
ATTRIBUTION_URL = 'https://docs.overturemaps.org/attribution/#buildings'
LOG = logging.getLogger(__name__)


def polygonal(geom):
    """Repair polygons without filling courtyards or joining separate parts."""
    geom = make_valid(geom) if not geom.is_valid else geom
    if isinstance(geom, (Polygon, MultiPolygon)):
        return geom
    return unary_union([polygonal(part) for part in getattr(geom, 'geoms', [])])


def validate(raw, bounds):
    if (not isinstance(raw, dict) or raw.get('cache_version') != CACHE_VERSION
            or raw.get('complete') is not True or raw.get('bounds') != list(bounds)
            or not isinstance(raw.get('release'), str) or not raw['release']
            or not isinstance(raw.get('features'), list)
            or raw.get('count') != len(raw['features'])):
        raise ValueError('Incomplete building download')
    if len(raw['features']) > MAX_BUILDINGS:
        raise ValueError('Too many buildings; select a smaller area')
    fetched = float(raw['fetched_at'])
    if not math.isfinite(fetched) or fetched > time.time() + 60:
        raise ValueError('Invalid building download timestamp')
    for feature in raw['features']:
        if (not isinstance(feature, dict) or not feature.get('id')
                or not isinstance(feature.get('properties'), dict)
                or feature.get('geometry', {}).get('type') not in ('Polygon', 'MultiPolygon')):
            raise ValueError('Malformed building footprint')
        geom = shape(feature['geometry'])
        if geom.is_empty or not all(math.isfinite(v) for v in geom.bounds):
            raise ValueError('Invalid building footprint coordinates')
    return raw


def download(bounds, cache_dir, progress):
    bounds = list(bounds)
    key = hashlib.sha256(json.dumps([CACHE_VERSION, bounds]).encode()).hexdigest()
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f'buildings-overture-{key}.json'
    if path.exists():
        try:
            raw = validate(json.loads(path.read_bytes()), bounds)
            if time.time() - raw['fetched_at'] < CACHE_TTL:
                progress(31, f'Using {raw["count"]:,} saved building outlines')
                return raw
        except (ValueError, KeyError, TypeError, AttributeError):
            LOG.warning('Discarding invalid building cache %s', path.name)
    progress(31, 'Downloading additional building outlines from Overture Maps…')
    with tempfile.NamedTemporaryFile(dir=cache_dir, prefix='.buildings-', suffix='.json', delete=False) as f:
        temp = Path(f.name)
    try:
        result = subprocess.run(
            worker_command('backend.buildings', json.dumps(bounds), str(temp)),
            cwd=ROOT, capture_output=True, text=True, timeout=DOWNLOAD_TIMEOUT, **subprocess_options(),
        )
        if result.returncode:
            LOG.error('Overture download failed: %s', result.stderr[-2000:])
            if 'Too many buildings' in result.stderr:
                raise ValueError('This selection contains too many buildings. Select a smaller area and generate again.')
            raise ValueError('The extra building data could not be downloaded. Try generating again. Your saved model is unchanged.')
        raw = validate(json.loads(temp.read_bytes()), bounds)
        os.replace(temp, path)
        return raw
    except subprocess.TimeoutExpired as exc:
        raise ValueError('The building download timed out. Try generating again; no incomplete model was saved.') from exc
    finally:
        temp.unlink(missing_ok=True)


def positive(value):
    try:
        number = float(value)
        return number if math.isfinite(number) and 0 < number < 900 else None
    except (ValueError, TypeError):
        return None


def supplement(features, raw, project_point, clip):
    """Keep OSM geometry/height; add new outlines before print-size enlargement.

    Matching uses source IDs when available, then substantial overlap with the
    smaller footprint, which also catches terraces represented as one roof.
    Mere boundary contact does not discard neighbouring houses.
    """
    part_records = [f for f in raw['features'] if f.get('properties',{}).get('_feature_type')=='building_part']
    parent_records = [f for f in raw['features'] if f.get('properties',{}).get('_feature_type')!='building_part']
    raw = {**raw, 'features':parent_records}
    result = list(features)
    existing = [(i, g, t) for i, (k, g, t) in enumerate(result)
                if k == 'building' and isinstance(g, (Polygon, MultiPolygon))]
    tree = STRtree([g for _, g, _ in existing])
    osm_ids = {t['_osm_id']: j for j, (_, _, t) in enumerate(existing) if '_osm_id' in t}
    counts = {'mapped_parts': 0, 'mapped_roofs': 0, 'osm_buildings': len(existing), 'overture_buildings': len(raw['features']),
              'added_buildings': 0, 'duplicate_buildings': 0, 'outside_buildings': 0,
              'height_enriched_buildings': 0, 'fallback_height_buildings': 0}
    datasets = set()
    seen = set()
    for feature in raw['features']:
        if feature['id'] in seen:
            counts['duplicate_buildings'] += 1
            continue
        seen.add(feature['id'])
        properties = feature['properties']
        sources = properties.get('sources') or []
        datasets.update(s['dataset'] for s in sources if s.get('dataset'))
        geom = polygonal(transform(project_point, polygonal(shape(feature['geometry']))).intersection(clip))
        if geom.is_empty or geom.area <= 0:
            counts['outside_buildings'] += 1
            continue
        matches = set()
        for source in sources:
            record = source.get('record_id') or ''
            if source.get('dataset') == 'OpenStreetMap':
                record = record.removeprefix('https://www.openstreetmap.org/').removeprefix('http://www.openstreetmap.org/')
                import re
                match = re.fullmatch(r'([wnr])(\d+)(?:@\d+)?', record)
                if match: record = {'w':'way','n':'node','r':'relation'}[match[1]]+'/'+match[2]
                if record in osm_ids:
                    matches.add(osm_ids[record])
        for j in tree.query(geom, predicate='intersects'):
            _, other, _ = existing[j]
            if geom.intersection(other).area > 0.5 * min(geom.area, other.area):
                matches.add(int(j))
        height = positive(properties.get('height'))
        levels = positive(properties.get('num_floors'))
        if matches:
            counts['duplicate_buildings'] += 1
            for j in matches:
                i, other, tags = existing[j]
                enriched = dict(tags)
                for key,tag in [('roof_shape','roof:shape'),('roof_height','roof:height'),('roof_direction','roof:direction'),('roof_orientation','roof:orientation')]:
                    if properties.get(key) is not None and tag not in enriched: enriched[tag]=str(properties[key])
                result[i] = ('building',other,enriched)
                existing[j] = (i,other,enriched)
                tags=enriched
                if height and not tags.get('building:part') and not tags.get('height') and not tags.get('building:levels'):
                    enriched = {**tags, 'height': str(height), '_height_source': 'Overture Maps'}
                    result[i] = ('building', other, enriched)
                    existing[j] = (i, other, enriched)
                    counts['height_enriched_buildings'] += 1
            continue
        tags = {'building': 'yes', '_overture_id': feature['id']}
        for source_key, tag in [('roof_shape','roof:shape'),('roof_height','roof:height'),('roof_direction','roof:direction'),('roof_orientation','roof:orientation')]:
            if properties.get(source_key) is not None: tags[tag] = str(properties[source_key])
        if height:
            tags['height'] = str(height)
        elif levels:
            tags['building:levels'] = str(levels)
        else:
            counts['fallback_height_buildings'] += 1
        result.append(('building', geom, tags))
        counts['added_buildings'] += 1
    live_parts = [g for k,g,t in result if k=='building' and t.get('building:part') not in (None,'no')]
    part_tree = STRtree(live_parts)
    seen_parts = set()
    for feature in part_records:
        if feature['id'] in seen_parts: continue
        seen_parts.add(feature['id'])
        props = feature['properties']
        if props.get('is_underground'): continue
        geom = polygonal(transform(project_point,polygonal(shape(feature['geometry']))).intersection(clip))
        if geom.is_empty: continue
        if any(geom.intersection(live_parts[int(j)]).area > .5*min(geom.area,live_parts[int(j)].area)
               for j in part_tree.query(geom,predicate='intersects')): continue
        tags = {'building:part':'yes','_overture_id':feature['id'],'_parent_id':props.get('building_id')}
        for key,tag in [('height','height'),('num_floors','building:levels'),('roof_shape','roof:shape'),('roof_height','roof:height'),('roof_direction','roof:direction'),('roof_orientation','roof:orientation'),('min_height','min_height')]:
            if props.get(key) is not None: tags[tag]=str(props[key])
        result.append(('building',geom,tags))
    result = detailed_parts(result)
    counts['mapped_parts'] = sum(bool(t.get('building:part')) for k,g,t in result if k=='building')
    counts['mapped_roofs'] = sum(bool(t.get('roof:shape')) for k,g,t in result if k=='building')
    return result, {**counts, 'provider': 'Overture Maps Foundation', 'release': raw['release'],
                    'license': 'ODbL 1.0', 'url': ATTRIBUTION_URL,
                    'datasets': sorted(datasets), 'fetched_at': raw['fetched_at']}


def detailed_parts(features):
    """Carve parent outlines around contained mapped wings/towers before extrusion."""
    parts = [g for k,g,t in features if k=='building' and t.get('building:part') not in (None,'no')]
    if not parts: return features
    tree = STRtree(parts)
    result = []
    for kind,geom,tags in features:
        if kind=='building' and not tags.get('building:part'):
            inside = [parts[int(j)] for j in tree.query(geom,predicate='intersects')
                      if geom.intersection(parts[int(j)]).area >= .95*parts[int(j)].area]
            if inside: geom = polygonal(geom.difference(unary_union(inside)))
        if not geom.is_empty: result.append((kind,geom,tags))
    return result


def fetch_area(bounds, output):
    """Worker entry point. Read full GeoParquet geometry, never map display tiles."""
    import socket
    from overturemaps import record_batch_reader
    from overturemaps.releases import get_latest_release
    from shapely import from_wkb

    socket.setdefaulttimeout(30)
    release = get_latest_release()
    features = []
    area = box(*bounds)
    for feature_type in ('building','building_part'):
        reader = record_batch_reader(feature_type, bbox=tuple(bounds), release=release,
                                     connect_timeout=10, request_timeout=45, stac=True)
        if reader is None:
            raise ValueError('The building source returned no readable data for this area')
        with reader:
            for batch in reader:
                fields = ('id','geometry','height','num_floors','sources','building_id','is_underground',
                          'roof_shape','roof_height','roof_direction','roof_orientation','min_height')
                columns = [name for name in fields if name in batch.schema.names]
                for row in batch.select(columns).to_pylist():
                    if row.get('is_underground'): continue
                    geom = polygonal(from_wkb(row.pop('geometry')))
                    if geom.is_empty or not geom.intersects(area): continue
                    row['_feature_type'] = feature_type
                    features.append({'type':'Feature','id':row.pop('id'),
                                     'geometry':mapping(geom),'properties':row})
                    if len(features)>MAX_BUILDINGS:
                        raise ValueError('Too many buildings; select a smaller area')
    raw = {'cache_version': CACHE_VERSION, 'complete': True, 'bounds': bounds,
           'release': release, 'fetched_at': time.time(), 'count': len(features), 'features': features}
    Path(output).write_text(json.dumps(validate(raw, bounds), allow_nan=False), encoding='utf-8')


if __name__ == '__main__':
    fetch_area(json.loads(sys.argv[1]), sys.argv[2])
