import json
from urllib.parse import parse_qs

import httpx
import pytest

from backend.config import Bounds, Settings
from backend import overpass


AREA = Bounds(south=53.50285144503212, west=-1.3464398585265656,
              north=53.53155707385238, east=-1.285150959686149)
SMALL = Settings(bounds=Bounds(south=53.51, west=-1.32, north=53.511, east=-1.319))
WAY = {'type': 'way', 'id': 5, 'tags': {'highway': 'residential'},
       'geometry': [{'lat': 53.49, 'lon': -1.35}, {'lat': 53.54, 'lon': -1.28}]}


@pytest.fixture
def clock(monkeypatch):
    class Clock:
        now = 0.0
        waits = []

        def sleep(self, seconds):
            self.waits.append(seconds)
            self.now += seconds
    clock = Clock()
    monkeypatch.setattr(overpass.time, 'monotonic', lambda: clock.now)
    monkeypatch.setattr(overpass.time, 'sleep', clock.sleep)
    return clock


def install_transport(monkeypatch, handler):
    client_class = httpx.Client
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(overpass.httpx, 'Client', lambda **kw: client_class(transport=transport, **kw))


def legacy_key(settings):
    b = settings.bounds
    return overpass.query_for(overpass.selectors(settings), (b.south, b.west, b.north, b.east), legacy=True)


def test_504_switches_server_and_reuses_complete_cache(tmp_path, monkeypatch, clock):
    calls = []

    def handler(request):
        calls.append(request)
        assert request.method == 'POST'
        assert not request.url.query
        query = parse_qs(request.content.decode())['data'][0]
        assert '[timeout:25]' in query
        if len(calls) == 1:
            return httpx.Response(504, text='Gateway timeout')
        return httpx.Response(200, json={'elements': [WAY]})

    install_transport(monkeypatch, handler)
    downloader = overpass.Downloader(tmp_path, {}, lambda *args: None)
    assert downloader.download(SMALL)['elements'] == [WAY]
    assert len(calls) == 2
    assert calls[0].url.host != calls[1].url.host
    assert overpass.Downloader(tmp_path, {}, lambda *args: None).download(SMALL)['elements'] == [WAY]
    assert len(calls) == 2


@pytest.mark.parametrize('bad', [
    {'remark': 'runtime error: Query timed out', 'elements': [WAY]},
    {'unexpected': 'not a map response'},
])
def test_partial_or_malformed_success_response_is_never_cached(tmp_path, monkeypatch, clock, bad):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json=bad if len(calls) == 1 else {'elements': [WAY]})

    install_transport(monkeypatch, handler)
    downloader = overpass.Downloader(tmp_path, {}, lambda *args: None)
    assert downloader.download(SMALL)['elements'] == [WAY]
    assert len(calls) == 2
    for path in tmp_path.glob('*.json'):
        assert json.loads(path.read_text())['elements'] == [WAY]
        assert 'remark' not in json.loads(path.read_text())


def test_old_poisoned_cache_does_not_poison_retry(tmp_path, monkeypatch, clock):
    downloader = overpass.Downloader(tmp_path, {}, lambda *args: None)
    path = downloader.path(legacy_key(SMALL))
    path.write_text(json.dumps({'elements': [], 'remark': 'Query timed out'}))
    install_transport(monkeypatch, lambda request: httpx.Response(200, json={'elements': [WAY]}))
    assert downloader.download(SMALL)['elements'] == [WAY]
    assert 'remark' not in json.loads(path.read_text())


def test_overload_subdivides_and_deduplicates_full_geometry(tmp_path, monkeypatch, clock):
    calls = []

    def handler(request):
        query = parse_qs(request.content.decode())['data'][0]
        calls.append(query)
        if len(calls) <= 2:
            return httpx.Response(504)
        return httpx.Response(200, json={'elements': [WAY, {'type': 'node', 'id': 5, 'lat': 53.51, 'lon': -1.32}]})

    install_transport(monkeypatch, handler)
    raw = overpass.Downloader(tmp_path, {}, lambda *args: None).download(SMALL)
    assert len(calls) == 6  # both mirrors fail, then four smaller sections succeed
    assert len(raw['elements']) == 2  # OSM node and way IDs occupy separate namespaces
    assert raw['elements'][0]['geometry'] == WAY['geometry']
    assert len(set(calls[2:])) == 4
    assert all(q.endswith('out geom;') for q in calls)  # never clip at download boundaries


def test_partial_download_resumes_without_publishing_partial_region(tmp_path, monkeypatch, clock):
    settings = Settings(bounds=AREA)
    successful = []

    def first(request):
        successful.append(parse_qs(request.content.decode())['data'][0])
        return httpx.Response(200, json={'elements': [WAY]})

    install_transport(monkeypatch, first)
    monkeypatch.setattr(overpass, 'MAX_REQUESTS', 1)
    downloader = overpass.Downloader(tmp_path, {}, lambda *args: None)
    with pytest.raises(ValueError, match='Completed sections are saved') as exc:
        downloader.download(settings)
    assert '?data=' not in str(exc.value)
    assert not downloader.path(legacy_key(settings)).exists()
    assert len(list(tmp_path.glob('*.json'))) == 1
    monkeypatch.setattr(overpass, 'MAX_REQUESTS', 48)
    raw = overpass.Downloader(tmp_path, {}, lambda *args: None).download(settings)
    assert len(successful) == 4  # first section was read from cache, not requested twice
    assert len(set(successful)) == 4
    assert raw['elements'] == [WAY]


def test_rate_limit_retry_after_is_respected(tmp_path, monkeypatch, clock):
    calls = []

    def handler(request):
        calls.append((request.url.host, clock.now))
        if len(calls) <= 2:
            return httpx.Response(429, headers={'Retry-After': '20'})
        return httpx.Response(200, json={'elements': []})

    install_transport(monkeypatch, handler)
    assert overpass.Downloader(tmp_path, {}, lambda *args: None).download(SMALL)['elements'] == []
    assert calls[2][1] >= 20


def test_retries_have_a_budget_and_never_cache_failures(tmp_path, monkeypatch, clock):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(504, text='Very long upstream URL and HTML error')

    install_transport(monkeypatch, handler)
    monkeypatch.setattr(overpass, 'MAX_REQUESTS', 3)
    with pytest.raises(ValueError, match='busy or unavailable'):
        overpass.Downloader(tmp_path, {}, lambda *args: None).download(SMALL)
    assert len(calls) == 3
    assert not list(tmp_path.glob('*.json'))


def test_long_retry_after_does_not_block_the_other_server(tmp_path, monkeypatch, clock):
    calls = []

    def handler(request):
        calls.append(request.url.host)
        if len(calls) == 1:
            return httpx.Response(429, headers={'Retry-After': '3600'})
        if len(calls) == 2:
            return httpx.Response(503)
        return httpx.Response(200, json={'elements': []})

    install_transport(monkeypatch, handler)
    assert overpass.Downloader(tmp_path, {}, lambda *args: None).download(SMALL)['elements'] == []
    assert calls[2] == calls[1]
    assert clock.now < 30


def test_combined_cache_does_not_extend_source_freshness(tmp_path, clock):
    old = overpass.time.time() - overpass.CACHE_TTL - 1
    raw = overpass.merge([{'elements': [WAY], '_contour_fetched_at': old},
                          {'elements': [], '_contour_fetched_at': overpass.time.time()}])
    downloader = overpass.Downloader(tmp_path, {}, lambda *args: None)
    downloader.save('query', raw)
    assert downloader.cached('query') is None


def test_building_parts_are_requested_and_parsed(tmp_path, monkeypatch):
    from backend.geodata import Geography
    from backend.overpass import selectors, Downloader
    s = Settings(name='Test region', bounds=AREA, building_source='osm')
    filters = selectors(s)
    assert 'nwr["building:part"]["building:part"!=no]' in filters
    assert 'nwr[building][building!=no]' in filters
    monkeypatch.setattr(Downloader, 'download', lambda self, settings: {'elements': [
        {'type': 'way', 'id': 10, 'tags': {'building:part': 'yes'}, 'geometry': [
            {'lon': -1.32, 'lat': 53.51}, {'lon': -1.319, 'lat': 53.51},
            {'lon': -1.319, 'lat': 53.511}, {'lon': -1.32, 'lat': 53.511},
            {'lon': -1.32, 'lat': 53.51}]}]})
    features, _ = Geography(s).vectors(lambda *args: None)
    assert len(features) == 1
    assert features[0][0] == 'building'
    assert features[0][1].area > 0


def test_large_requests_stay_bounded_instead_of_using_four_by_four_cap(tmp_path, monkeypatch, clock):
    settings = Settings(bounds=Bounds(west=0, east=.15, south=0, north=.15))
    queries = []
    def handler(request):
        queries.append(parse_qs(request.content.decode())['data'][0])
        return httpx.Response(200, json={'elements': []})
    install_transport(monkeypatch, handler)
    overpass.Downloader(tmp_path, {}, lambda *a: None).download(settings)
    assert len(queries) == 36
    import re
    for query in queries:
        south, west, north, east = map(float, re.search(r'\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)', query).groups())
        assert (east-west)*111320 <= 3000
        assert (north-south)*111320 <= 3000


def test_huge_uncached_region_avoids_overloading_public_servers(tmp_path, monkeypatch):
    settings = Settings(bounds=Bounds(west=0, east=1, south=0, north=1))
    def handler(request):
        pytest.fail('Huge regions must not send oversized map queries')
    install_transport(monkeypatch, handler)
    with pytest.raises(overpass.DownloadBudgetExceeded, match='too many'):
        overpass.Downloader(tmp_path, {}, lambda *a: None).download(settings)


def test_large_area_cache_is_reused_even_above_section_limit(tmp_path, monkeypatch):
    settings = Settings(bounds=Bounds(west=0,east=1,south=0,north=1))
    downloader = overpass.Downloader(tmp_path, {}, lambda *a:None)
    downloader.save(legacy_key(settings), {'elements':[WAY], '_contour_fetched_at':overpass.time.time()})
    def handler(request):
        pytest.fail('Complete saved data should avoid network requests')
    install_transport(monkeypatch,handler)
    assert downloader.download(settings)['elements'] == [WAY]


def test_large_area_retry_deadline_is_bounded(tmp_path, monkeypatch, clock):
    calls=[]
    def handler(request):
        calls.append(request)
        clock.now += 40
        return httpx.Response(504)
    install_transport(monkeypatch,handler)
    downloader=overpass.Downloader(tmp_path, {}, lambda *a:None, budget_seconds=90)
    with pytest.raises(overpass.OverpassUnavailable):
        downloader.download(SMALL)
    assert len(calls) <= 3
    assert not list(tmp_path.glob('*.json'))
