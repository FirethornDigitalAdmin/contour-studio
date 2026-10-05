"""Cached public geographic data. No synthetic fallback in production."""
import hashlib
import io
import json
import math
import os
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock

import httpx
import numpy as np
from PIL import Image
from pyproj import Transformer
from scipy.ndimage import map_coordinates
from shapely.geometry import LineString, Polygon, box
from shapely.errors import GEOSException
from shapely.ops import polygonize, transform, unary_union

from .overpass import Downloader, OverpassUnavailable
from . import buildings
from .world import longitude_span, unwrap, rectangles, selection_area_km2, MAX_BUILDING_AREA_KM2

from .paths import RESOURCE_ROOT as ROOT, DATA_ROOT
CACHE = DATA_ROOT / 'cache'
CACHE.mkdir(parents=True, exist_ok=True)
HEADERS = {'User-Agent': 'ContourStudioLocal/1.0 (personal topographic artwork generator)'}
MERCATOR = Transformer.from_crs(4326, 3857, always_xy=True)
SEARCH_LOCK = Lock()
LAST_SEARCH = 0.0


def fetch(url, cache_key, ttl=None, params=None, validate=None):
    path = CACHE / cache_key
    if path.exists() and (ttl is None or time.time()-path.stat().st_mtime < ttl):
        try:
            data=path.read_bytes()
            if validate:
                validate(data)
            return data
        except (OSError,ValueError,TypeError):
            # A truncated local cache is recoverable; do not repeat the same
            # failure indefinitely when the user retries generation.
            path.unlink(missing_ok=True)
    with httpx.Client(timeout=90, headers=HEADERS, follow_redirects=True) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
    if validate:
        validate(response.content)
    with tempfile.NamedTemporaryFile(dir=CACHE,prefix='.geodata-',delete=False) as handle:
        temp=Path(handle.name)
        handle.write(response.content)
    try:
        os.replace(temp,path)
    finally:
        temp.unlink(missing_ok=True)
    return response.content


def search(query):
    global LAST_SEARCH
    # Coordinates work even for unnamed places, independently of the geocoder.
    import re
    match = re.fullmatch(r'\s*([+-]?\d+(?:\.\d+)?)\s*[,;]\s*([+-]?\d+(?:\.\d+)?)\s*', query)
    if match:
        lat, lon = map(float, match.groups())
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError('Coordinates must be latitude −90…90, longitude −180…180.')
        return [{'lat': str(lat), 'lon': str(lon), 'display_name': f'{lat:g}°, {lon:g}°', 'type': 'coordinates'}]
    key = 'search-' + hashlib.sha256(query.encode()).hexdigest() + '.json'
    with SEARCH_LOCK:
        time.sleep(max(0, 1.1-(time.monotonic()-LAST_SEARCH)))
        try:
            def validate(data):
                if not isinstance(json.loads(data),list):
                    raise ValueError('Location search returned an invalid response.')
            return json.loads(fetch('https://nominatim.openstreetmap.org/search',key,86400*7,
                                    {'q':query,'format':'jsonv2','limit':5},validate=validate))
        finally:
            LAST_SEARCH = time.monotonic()


class Geography:
    def __init__(self, settings):
        self.settings = settings
        b = settings.bounds
        self.polar = b.south < -85 or b.north > 85
        self.west = b.west
        self.east = b.west + longitude_span(b.west,b.east)
        self.x0 = math.radians(self.west)*6378137
        self.x1 = math.radians(self.east)*6378137
        self.y0 = self.latitude_y(b.south)
        self.y1 = self.latitude_y(b.north)
        from .artwork_shapes import uses_shape
        self.inset = 0 if uses_shape(settings) else (settings.frame_width if settings.frame_mode != 'none' else 0)
        self.map_width = settings.width-2*self.inset
        self.map_height = settings.height-2*self.inset
        factor = math.cos(math.radians((b.north+b.south)/2))
        self.ground_width = (self.x1-self.x0)*factor
        self.ground_height = (b.north-b.south)*111320 if self.polar else (self.y1-self.y0)*factor
        self.scale = settings.wall_scale if settings.wall_mode=="continuous" and settings.wall_scale is not None else min(self.map_width/self.ground_width,self.map_height/self.ground_height)

    def latitude_y(self, lat):
        return math.radians(lat)*6378137 if self.polar else MERCATOR.transform(0,lat)[1]

    def point(self, lon, lat):
        # Shapely may pass whole coordinate arrays to a transform.
        lon = np.asarray(lon)
        x = np.radians(self.west + (lon-self.west+180)%360-180)*6378137
        y = np.radians(lat)*6378137 if self.polar else MERCATOR.transform(np.zeros_like(lat),lat)[1]
        return (self.inset+(x-self.x0)/(self.x1-self.x0)*self.map_width,
                self.inset+(y-self.y0)/(self.y1-self.y0)*self.map_height)

    def elevation(self, xs, ys, progress):
        if self.polar:
            from .polar import elevation
            return elevation(self, xs, ys, progress, fetch)
        world = 40075016.68557849
        z = min(15,max(7,math.ceil(math.log2(world/max(self.x1-self.x0,self.y1-self.y0)*max(len(xs),len(ys))/256))))
        def coords(zoom):
            size = 256*2**zoom
            mx = self.x0+(xs-self.inset)/self.map_width*(self.x1-self.x0)
            my = self.y0+(ys-self.inset)/self.map_height*(self.y1-self.y0)
            return (mx/world+0.5)*size, (0.5-my/world)*size
        # Bound network requests for very elongated regions.
        while True:
            px,py=coords(z)
            tx0,tx1=math.floor((px.min()-1)/256),math.floor((px.max()+1)/256)
            ty0,ty1=math.floor((py.min()-1)/256),math.floor((py.max()+1)/256)
            if (tx1-tx0+1)*(ty1-ty0+1) <= 36 or z <= 4:
                break
            z-=1
        tasks=[(x,y) for y in range(ty0,ty1+1) for x in range(tx0,tx1+1)]
        progress(9,f'Fetching {len(tasks)} elevation tiles (zoom {z})')
        def tile(pair):
            x,y=pair
            wrapped_x=x % (2**z)
            def decode(data):
                with Image.open(io.BytesIO(data)) as image:
                    if image.size!=(256,256):
                        raise ValueError('Elevation source returned an invalid tile size.')
                    return np.asarray(image.convert('RGB'),dtype=np.float64)
            data=fetch(f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{wrapped_x}/{y}.png',
                       f'dem-{z}-{wrapped_x}-{y}.png',validate=decode)
            rgb=decode(data)
            return x,y,rgb[:,:,0]*256+rgb[:,:,1]+rgb[:,:,2]/256-32768
        mosaic=np.zeros(((ty1-ty0+1)*256,(tx1-tx0+1)*256))
        with ThreadPoolExecutor(max_workers=4) as pool:
            for x,y,arr in pool.map(tile,tasks):
                mosaic[(y-ty0)*256:(y-ty0+1)*256,(x-tx0)*256:(x-tx0+1)*256]=arr
        xx,yy=np.meshgrid(px-tx0*256-0.5,py-ty0*256-0.5)
        dem=map_coordinates(mosaic,[yy,xx],order=1,mode='nearest')
        if not np.isfinite(dem).all():
            raise ValueError('Elevation source returned invalid samples.')
        return dem, {'provider':'Mapzen / AWS Terrain Tiles','zoom':z,'tiles':len(tasks),
                     'url':'https://registry.opendata.aws/terrain-tiles/',
                     'attribution':'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
                     'sample_spacing_m':world*math.cos(math.radians((self.settings.bounds.north+self.settings.bounds.south)/2))/(256*2**z)}

    def vectors(self, progress):
        s=self.settings
        large_area = selection_area_km2(s.bounds) > MAX_BUILDING_AREA_KM2
        if large_area:
            s = s.model_copy(update={'buildings': False})
        detail_metadata = {'building_detail_omitted': large_area, 'building_area_limit_km2': MAX_BUILDING_AREA_KM2}
        if not s.railways and not s.urban_spaces and s.roads=='none' and not s.water and not s.buildings and not s.landmarks and not (s.forests or s.fields or s.multicolour):
            return [], {'provider':'OpenStreetMap','elements':0,'disabled':True, **detail_metadata}
        try:
            raw=Downloader(CACHE,HEADERS,progress,budget_seconds=90 if large_area else None).download(s)
        except OverpassUnavailable as exc:
            if not large_area:
                raise
            # Elevation has already been acquired independently. Do not discard
            # it or present an incomplete subset of vectors as complete coverage.
            warning = ('Large-area terrain-only model: mapped roads, water, land cover and landmarks '
                       'could not be loaded and are omitted. Real elevation is retained. '
                       'Select a smaller area for mapped detail, or generate again to reuse saved sections. '
                       f'Reason: {exc}')
            progress(31, 'Continuing with real terrain; mapped landscape detail unavailable')
            return [], {'provider':'OpenStreetMap','elements':0,'disabled':True,
                        'terrain_only_fallback':True, 'warning':warning, **detail_metadata}
        clip=box(self.inset,self.inset,s.width-self.inset,s.height-self.inset)
        features=[]
        skipped=0
        for el in raw.get('elements',[]):
            try:
                tags={**(el.get('tags') or {}), '_osm_id': f'{el["type"]}/{el["id"]}'}
                kind='building' if any(tags.get(k) not in (None,'no') for k in ('building','building:part')) else 'water' if ('water' in tags or tags.get('natural')=='water' or 'waterway' in tags) else 'road' if 'highway' in tags else 'landmark'
                if kind=='building' and large_area:
                    continue
                if kind=='landmark':
                    from .infrastructure import GREEN_LEISURE, HARD_LANDUSE
                    if 'railway' in tags: kind='railway'
                    elif tags.get('leisure') in GREEN_LEISURE or tags.get('landuse')=='recreation_ground': kind='park'
                    elif tags.get('landuse') in HARD_LANDUSE or tags.get('amenity')=='parking': kind='hardscape'
                if kind=='landmark':
                    if tags.get('natural') in ('tree','tree_row','tree_group'): kind={'tree':'tree','tree_row':'tree_row','tree_group':'tree_canopy'}[tags['natural']]
                    elif tags.get('landuse')=='forest' or tags.get('natural')=='wood': kind='forest'
                    elif tags.get('landuse')=='farmland': kind='field'
                    elif tags.get('landuse') in ('meadow','grass') or tags.get('natural') in ('grassland','scrub'): kind='grass'
                if el['type']=='relation':
                    outer=[]; inner=[]
                    for member in el.get('members',[]):
                        pts=[self.point(p['lon'],p['lat']) for p in member.get('geometry',[]) if p]
                        if len(pts)>1: (inner if member.get('role')=='inner' else outer).append(LineString(pts))
                    geom=unary_union(list(polygonize(unary_union(outer))))
                    if inner: geom=geom.difference(unary_union(list(polygonize(unary_union(inner)))))
                elif el['type']=='node':
                    if kind=='tree_canopy':
                        skipped+=1
                        continue  # A group point does not specify a canopy boundary.
                    from shapely.geometry import Point
                    geom=Point(*self.point(el['lon'],el['lat']))
                    if kind!='tree': geom=geom.buffer(1.4)
                else:
                    pts=[self.point(p['lon'],p['lat']) for p in el.get('geometry',[]) if p]
                    if len(pts)<2: continue
                    closed=len(pts)>3 and pts[0]==pts[-1]
                    polygon=closed and (kind not in ('road','railway','tree_row') or tags.get('railway')=='platform')
                    geom=Polygon(pts).buffer(0) if polygon else LineString(pts)
                geom=geom.intersection(clip)
                if kind in ('forest','field','grass','park','hardscape','tree_canopy'):
                    geom=buildings.polygonal(geom)
                if not geom.is_empty: features.append((kind,geom,tags))
            except (ValueError,KeyError,TypeError,OverflowError,GEOSException):
                skipped+=1
        metadata={'provider':'OpenStreetMap contributors','license':'ODbL 1.0',
                  'url':'https://www.openstreetmap.org/copyright','elements':len(features),'skipped':skipped, **detail_metadata}
        if s.buildings and s.building_source=='combined':
            b=s.bounds
            downloads=[buildings.download(rect,CACHE,progress) for rect in rectangles(b.west,b.south,b.east,b.north)]
            raw={**downloads[0], 'features': [f for download in downloads for f in download['features']]}
            if len(raw['features']) > buildings.MAX_BUILDINGS:
                raise ValueError('This selection contains too many buildings. Select a smaller area.')
            features,coverage=buildings.supplement(features,raw,self.point,clip)
            metadata.update(provider='OpenStreetMap + Overture Maps',url=buildings.ATTRIBUTION_URL,
                            elements=len(features),buildings=coverage)
            progress(31,f'Loaded {coverage["osm_buildings"]+coverage["added_buildings"]:,} buildings '
                        f'({coverage["added_buildings"]:,} additional outlines)')
        if s.buildings:
            features=buildings.detailed_parts(features)
        if s.forests:
            from . import trees
            additional,coverage=trees.download(self,fetch,progress)
            features.extend(additional)
            metadata['tree_canopy']=coverage
            metadata['elements']=len(features)
        return features,metadata
