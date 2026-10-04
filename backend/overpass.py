"""Bounded, resumable downloads of complete OSM geometry.

Download rectangles are unrelated to print tiles. Full feature geometries are
deduplicated and merged before projection, modelling, or printable tile cutting.
"""
import hashlib
import json
import logging
import math
import os
import tempfile
import time
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlsplit

import httpx

from .world import longitude_span, rectangles

ENDPOINTS = (
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
)
CACHE_TTL = 7 * 86400
TOTAL_SECONDS = 240
MAX_REQUESTS = 48
MAX_INITIAL_SECTIONS = 48
LOG = logging.getLogger(__name__)


class IncompleteResponse(ValueError):
    pass


class OverpassUnavailable(ValueError):
    pass


class DownloadBudgetExceeded(OverpassUnavailable):
    pass


def selectors(settings):
    result = []
    if settings.roads != 'none':
        result.append('way[highway]')
    if settings.railways:
        result.append('way[railway~"^(rail|light_rail|tram|narrow_gauge|preserved|platform)$"]')
        result.append('relation[railway=platform][type=multipolygon]')
    if settings.urban_spaces:
        result.extend(['nwr[leisure~"^(park|garden|recreation_ground|pitch|golf_course)$"]',
                       'nwr[landuse~"^(recreation_ground|industrial|commercial|retail|railway)$"]',
                       'nwr[amenity=parking]'])
    if settings.water:
        result.extend(['way[waterway]', 'nwr[natural=water]', 'nwr[water]'])
    if settings.buildings:
        result.extend(['nwr[building][building!=no]', 'nwr["building:part"]["building:part"!=no]'])
    if settings.landmarks:
        result.extend(['nwr[historic]', 'nwr[tourism=attraction]'])
    if settings.forests or settings.fields or settings.multicolour:
        result.extend(['nwr[landuse~"^(forest|farmland|meadow|grass)$"]',
                       'nwr[natural~"^(wood|grassland|scrub)$"]'])
    if settings.forests:
        result.extend(['node[natural=tree]', 'way[natural=tree_row]', 'nwr[natural=tree_group]'])
    return result


def query_for(filters, bounds, legacy=False):
    south, west, north, east = bounds
    bbox = f'{south},{west},{north},{east}'
    # Lower resource declarations are easier for busy public servers to admit.
    header = '[out:json][timeout:90];' if legacy else '[out:json][timeout:25][maxsize:134217728];'
    return header + '(' + ''.join(f'{s}({bbox});' for s in filters) + ');out geom;'


def validate(raw):
    if not isinstance(raw, dict) or raw.get('remark') or not isinstance(raw.get('elements'), list):
        raise IncompleteResponse('Server returned incomplete map data')
    for element in raw['elements']:
        if (not isinstance(element, dict) or element.get('type') not in ('node', 'way', 'relation')
                or not isinstance(element.get('id'), int)):
            raise IncompleteResponse('Server returned malformed map data')
    return raw


def merge(responses):
    elements = {}
    for raw in responses:
        for element in raw['elements']:
            key = element['type'], element['id']
            # Full geometry is requested, never out geom(bbox). A road/building
            # crossing several download rectangles is one complete OSM feature.
            if key not in elements or element.get('version', 0) > elements[key].get('version', 0):
                elements[key] = element
    return {
        'elements': list(elements.values()),
        '_contour_fetched_at': min(r['_contour_fetched_at'] for r in responses),
    }


def split(bounds, columns=2, rows=2):
    south, west, north, east = bounds
    xs = [west + (east-west)*i/columns for i in range(columns+1)]
    ys = [south + (north-south)*i/rows for i in range(rows+1)]
    return [(ys[r], xs[c], ys[r+1], xs[c+1]) for r in range(rows) for c in range(columns)]


class Downloader:
    def __init__(self, cache_dir, headers, progress, budget_seconds=None):
        self.cache_dir = Path(cache_dir)
        self.headers = headers
        self.progress = progress
        self.deadline = time.monotonic() + (TOTAL_SECONDS if budget_seconds is None else budget_seconds)
        self.requests = 0
        self.preferred = ENDPOINTS[0]
        self.cooldowns = {}
        self.last_error = 'map data service temporarily unavailable'

    def path(self, query):
        return self.cache_dir / ('osm-' + hashlib.sha256(query.encode()).hexdigest() + '.json')

    def cached(self, query):
        path = self.path(query)
        if not path.is_file():
            return None
        try:
            raw = validate(json.loads(path.read_bytes()))
            acquired = float(raw.get('_contour_fetched_at', path.stat().st_mtime))
            if not math.isfinite(acquired) or acquired > time.time()+60:
                raise IncompleteResponse('Invalid cache timestamp')
            if time.time() - acquired >= CACHE_TTL:
                return None
            raw['_contour_fetched_at'] = acquired
            return raw
        except (ValueError, TypeError):
            # Older versions cached HTTP 200 responses before checking remarks.
            path.unlink(missing_ok=True)
            LOG.warning('Discarded invalid Overpass cache entry %s', path.name)
            return None

    def save(self, query, raw):
        validate(raw)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        # Unique temporary files also make independent local runs safe to cache.
        with tempfile.NamedTemporaryFile(dir=self.cache_dir, prefix='.osm-', delete=False) as f:
            name = f.name
            f.write(json.dumps(raw).encode())
        try:
            os.replace(name, self.path(query))
        finally:
            Path(name).unlink(missing_ok=True)

    def remaining(self):
        seconds = self.deadline - time.monotonic()
        if seconds <= 0 or self.requests >= MAX_REQUESTS:
            raise DownloadBudgetExceeded('Map download retry limit reached')
        return seconds

    def pause(self, seconds, percent, label):
        if seconds <= 0:
            return
        if seconds >= self.remaining():
            raise DownloadBudgetExceeded('Map servers are still cooling down')
        self.progress(percent, f'{label}: server busy, retrying in {math.ceil(seconds)}s')
        time.sleep(seconds)

    def request(self, client, query, percent, label):
        now = time.monotonic()
        endpoints = sorted(ENDPOINTS, key=lambda e: (max(0, self.cooldowns.get(e, 0)-now), e != self.preferred))
        for endpoint in endpoints:
            self.pause(max(0, self.cooldowns.get(endpoint, 0)-time.monotonic()), percent, label)
            remaining = self.remaining()
            host = urlsplit(endpoint).hostname
            self.progress(percent, f'{label}: downloading from {host}')
            self.requests += 1
            try:
                # POST avoids long encoded URLs and keeps errors readable.
                response = client.post(endpoint, data={'data': query},
                                       timeout=httpx.Timeout(min(40, remaining), connect=min(8, remaining)))
                response.raise_for_status()
                raw = validate(response.json())
                raw['_contour_fetched_at'] = time.time()
                self.save(query, raw)
                self.preferred = endpoint
                return raw
            except httpx.HTTPStatusError as exc:
                code = exc.response.status_code
                self.last_error = f'{host}: HTTP {code}'
                retry_after = exc.response.headers.get('Retry-After')
                delay = 15.0 if code == 429 else 2.0
                if retry_after:
                    try:
                        delay = max(delay, float(retry_after))
                    except ValueError:
                        try:
                            delay = max(delay, parsedate_to_datetime(retry_after).timestamp()-time.time())
                        except (ValueError, TypeError, OverflowError):
                            pass
                self.cooldowns[endpoint] = time.monotonic() + delay
            except (httpx.RequestError, ValueError) as exc:
                self.last_error = f'{host}: {"incomplete response" if isinstance(exc, ValueError) else type(exc).__name__}'
                self.cooldowns[endpoint] = time.monotonic() + 2
            LOG.warning('Overpass attempt %d failed: %s', self.requests, self.last_error)
        raise OverpassUnavailable(self.last_error)

    def section(self, client, filters, bounds, percent, label, depth=0):
        query = query_for(filters, bounds)
        cached = self.cached(query)
        if cached is not None:
            self.progress(percent, f'{label}: using saved map data')
            return cached
        try:
            return self.request(client, query, percent, label)
        except DownloadBudgetExceeded:
            raise
        except OverpassUnavailable:
            if depth >= 1:
                self.pause(2, percent, label)
                return self.request(client, query, percent, label)
            self.progress(percent, f'{label}: trying smaller map sections')
            raw = merge([self.section(client, filters, cell, percent, f'{label}.{i+1}', depth+1)
                         for i, cell in enumerate(split(bounds))])
            self.save(query, raw)
            return raw

    def download(self, settings):
        b = settings.bounds
        bounds = (b.south, b.west, b.north, b.east)
        filters = selectors(settings)
        legacy_query = query_for(filters, bounds, legacy=True)
        cached = self.cached(legacy_query)
        if cached is not None:
            self.progress(30, 'Using saved OpenStreetMap data')
            return cached
        # Keep request footprints bounded even for large selections. A fixed
        # 4x4 cap made individual queries grow without limit with the region.
        plans = []
        for west, south, east, north in rectangles(b.west,b.south,b.east,b.north):
            ground_w = (east-west)*111320*math.cos(math.radians((north+south)/2))
            ground_h = (north-south)*111320
            plans.append(((south,west,north,east), max(1, math.ceil(ground_w/3000)),
                          max(1, math.ceil(ground_h/3000))))
        if sum(columns*rows for _,columns,rows in plans) > MAX_INITIAL_SECTIONS:
            raise DownloadBudgetExceeded('Selected area needs too many detailed map sections; use terrain-only generation or select a smaller area.')
        cells = [cell for bounds,columns,rows in plans for cell in split(bounds,columns,rows)]
        self.progress(22, f'Fetching OpenStreetMap data in {len(cells)} smaller sections')
        responses = []
        try:
            with httpx.Client(headers=self.headers, follow_redirects=True) as client:
                for i, cell in enumerate(cells):
                    responses.append(self.section(client, filters, cell, 22+int(8*i/len(cells)),
                                                  f'Map section {i+1}/{len(cells)}'))
        except OverpassUnavailable as exc:
            raise OverpassUnavailable(
                'OpenStreetMap servers are busy or unavailable. Completed sections are saved; '
                'click Generate model again to resume with roads, water and buildings enabled. '
                f'Last attempt: {self.last_error}.'
            ) from exc
        raw = merge(responses)
        # Publish the combined cache only once EVERY section is present.
        self.save(legacy_query, raw)
        self.progress(31, f'Loaded {len(raw["elements"]):,} OpenStreetMap features')
        return raw
