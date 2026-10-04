"""Real non-woodland canopy from Forest Research's public TOW service."""
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor

from pyproj import Transformer
from shapely.geometry import box, shape
from shapely.ops import transform

SERVICE = 'https://services-eu1.arcgis.com/B07JPhDOjwgXOYvb/arcgis/rest/services/'
LAYERS = [SERVICE + f'Trees_Outside_Woodland_view/FeatureServer/{i}' for i in range(8)] + [
    SERVICE + 'main_FR_TOW_V4_East_Midlands_Public_view/FeatureServer/0']
URL = 'https://www.forestresearch.gov.uk/tools-and-resources/fthr/trees-outside-woodland-tow-projects/trees-outside-woodland-map/'
ATTRIBUTION = ('Contains, or is based on, information supplied by the Forestry Commission. '
               '© Crown copyright and database right 2024 Ordnance Survey AC0000814847')
MAX_CANOPIES = 20000
PAGE_SIZE = 1000


def download(geo, fetch, progress):
    b = geo.settings.bounds
    meta = dict(provider='Forest Research Trees Outside Woodland', url=URL,
                license='Open Government Licence v3.0', attribution=ATTRIBUTION, features=0)
    # Geographic gate is only a request optimisation, not a claim of coverage.
    if b.west > b.east or not box(-6.5,49.8,2,56).intersects(box(b.west,b.south,b.east,b.north)):
        return [], {**meta, 'status':'outside_service_region'}
    from .world import selection_area_km2
    if selection_area_km2(b) > 100:
        return [], {**meta, 'status':'omitted_large_area',
                    'warning':'Additional tree canopy omitted above 100 km²; select a smaller area for Trees Outside Woodland detail.'}
    progress(30, 'Fetching real tree canopy outside woodland')
    envelope = f'{b.west},{b.south},{b.east},{b.north}'
    def request(url, params):
        def validate(data):
            result=json.loads(data)
            if not isinstance(result,dict) or 'error' in result:
                raise ValueError('Tree canopy service returned an invalid response.')
        key='tow-'+hashlib.sha256((url+json.dumps(params,sort_keys=True)).encode()).hexdigest()+'.json'
        return json.loads(fetch(url,key,86400*30,params,validate=validate))
    def layer(url):
        info=request(url,{'f':'json'})
        extent=info['extent']; wkid=extent['spatialReference'].get('latestWkid',extent['spatialReference']['wkid'])
        bounds=Transformer.from_crs(4326,wkid,always_xy=True).transform_bounds(b.west,b.south,b.east,b.north)
        if not box(*bounds).intersects(box(extent['xmin'],extent['ymin'],extent['xmax'],extent['ymax'])):
            return []
        found=[]; offset=0
        while True:
            data=request(url+'/query',dict(f='geojson',where='1=1',geometry=envelope,
                geometryType='esriGeometryEnvelope',inSR=4326,outSR=4326,
                spatialRel='esriSpatialRelIntersects',outFields='*',orderByFields='OBJECTID ASC',
                resultOffset=offset,resultRecordCount=PAGE_SIZE,returnGeometry='true'))
            page=data.get('features')
            if not isinstance(page,list): raise ValueError('Tree canopy service returned no feature collection.')
            found.extend(page)
            if len(found)>MAX_CANOPIES: raise ValueError('Tree canopy selection exceeds the detail limit.')
            if not data.get('exceededTransferLimit') and len(page)<PAGE_SIZE: break
            if not page: raise ValueError('Tree canopy service returned an incomplete page.')
            offset+=len(page)
        return found
    # No partial regional subset is presented as complete after a service failure.
    try:
        with ThreadPoolExecutor(max_workers=4) as pool:
            raw=[feature for region in pool.map(layer,LAYERS) for feature in region]
        if len(raw)>MAX_CANOPIES: raise ValueError('Tree canopy selection exceeds the detail limit.')
        clip=box(geo.inset,geo.inset,geo.settings.width-geo.inset,geo.settings.height-geo.inset)
        features=[]
        for item in raw:
            geom=transform(geo.point,shape(item['geometry'])).buffer(0).intersection(clip)
            if geom.is_empty: continue
            features.append(('tree_canopy',geom,{**item.get('properties',{}),'_source':'Forest Research TOW'}))
        return features,{**meta,'features':len(features),'status':'loaded',
                         'limitation':'Canopy detected from lidar and imagery, not surveyed trunks; minimum 3 m height and 5 m² area. Source dates vary and classification errors are possible.'}
    except Exception as exc:
        return [],{**meta,'status':'unavailable','warning':f'Additional tree canopy unavailable; only OpenStreetMap tree data is used. {exc}'}
