import json
import logging
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from shapely import affinity
from shapely.geometry import box

from .config import LocationMarker, Settings
from .worker import build_project
from .geometry import marker_shape
from .geodata import ROOT, Geography, search

app=FastAPI(title='Contour Studio',version='1.0.0')
from .paths import DATA_ROOT
OUTPUT=DATA_ROOT/'projects'
OUTPUT.mkdir(parents=True,exist_ok=True)
executor=ThreadPoolExecutor(max_workers=1)
jobs={}; lock=Lock()


@app.get('/api/health')
def health(): return {'status':'ok','application':'Contour Studio'}


@app.get('/api/updates')
def update_info():
    from .updates import info
    return info()


@app.get('/api/updates/check')
def update_check():
    from .updates import check_updates, info
    if not info()['desktop']:
        raise HTTPException(404, 'Updates are available in the desktop app.')
    try:
        return check_updates()
    except Exception:
        logging.warning('Release check unavailable', exc_info=True)
        raise HTTPException(503, 'Could not check for updates. Try again later.')


@app.get('/api/preset')
def preset(): return Settings().model_dump()


@app.get('/api/search')
def location_search(q:str):
    q=q.strip()
    if not 2<=len(q)<=160: raise HTTPException(400,'Enter a location between 2 and 160 characters.')
    try: return search(q)
    except Exception as exc: raise HTTPException(502,f'Location search is unavailable. You can select an area directly on the map. {exc}')


@app.post('/api/validate')
def validate_settings(s:Settings):
    validate_marker_positions(s)
    return s.model_dump()


def validate_marker_positions(s):
    """Check the exact printable badges before any source data is requested."""
    markers=list(s.markers)
    if s.marker:
        markers.append(LocationMarker(id='legacy',label='Custom marker',symbol='pin',
                                      lon=s.marker_lon,lat=s.marker_lat,size=3.4,rise=2))
    if not markers:
        return
    geo=Geography(s)
    safe_area=box(geo.inset,geo.inset,s.width-geo.inset,s.height-geo.inset).buffer(-0.1)
    for marker in markers:
        x,y=geo.point(marker.lon,marker.lat)
        footprint=affinity.translate(marker_shape(marker.symbol,marker.size),x,y)
        if not safe_area.covers(footprint):
            raise HTTPException(422,f'Marker “{marker.label}” lies outside the map or too close to its edge. Move it inward or reduce its size.')


TRACING_LOCK = Lock()
TRACING_CACHE = {}


@app.post('/api/footprints')
def tracing_footprints(s:Settings):
    import time
    key = (s.bounds.west,s.bounds.south,s.bounds.east,s.bounds.north,s.building_source)
    # Development remounts and reopening the editor share one provider request.
    with TRACING_LOCK:
        cached = TRACING_CACHE.get(key)
        if cached and time.monotonic()-cached[0] < 300:
            return cached[1]
        result = load_tracing_footprints(s)
        if len(TRACING_CACHE) >= 8:
            TRACING_CACHE.pop(next(iter(TRACING_CACHE)))
        TRACING_CACHE[key] = (time.monotonic(),result)
        return result


def load_tracing_footprints(s:Settings):
    from shapely.geometry import mapping
    from shapely.ops import transform
    # Reuse the exact source footprints used by generation, without terrain.
    source=s.model_copy(update=dict(roads='none',water=False,forests=False,fields=False,
                                   multicolour=False,landmarks=False,buildings=True))
    geo=Geography(source)
    try:
        features, metadata=geo.vectors(lambda *args: None)
    except Exception as exc:
        logging.warning('Tracing footprints unavailable', exc_info=True)
        raise HTTPException(502, 'Building outlines could not be loaded. You can still trace over your image.') from exc
    def normalise(x,y,z=None):
        import numpy as np
        return (np.asarray(x)-geo.inset)/geo.map_width*1000, (1-(np.asarray(y)-geo.inset)/geo.map_height)*1000
    return {'type':'FeatureCollection','features':[
        {'type':'Feature','geometry':mapping(transform(normalise,g)), 'properties':{'id':tags.get('_osm_id',tags.get('_overture_id',''))}}
        for kind,g,tags in features if kind=='building'], 'attribution':metadata.get('provider','')}


@app.post('/api/layout')
def layout(s:Settings):
    cols,rows=s.tile_layout()
    return {'columns':cols,'rows':rows,'tile_width':s.width/cols,'tile_height':s.height/rows,
            'usable_width':s.printer_width-2*s.margin,'usable_height':s.printer_height-2*s.margin}


@app.post('/api/generate',status_code=202)
def generate(s:Settings):
    validate_marker_positions(s)
    with lock:
        if getattr(app.state, 'update_installing', False):
            raise HTTPException(409, 'An app update is being installed. Wait for the app to restart before generating.')
        if any(j['status'] in ('queued','running') for j in jobs.values()):
            raise HTTPException(409,'A model is already being generated. Wait for it to finish.')
        ident=str(uuid.uuid4())
        jobs[ident]={'id':ident,'status':'queued','progress':0,'message':'Preparing geographic data','settings':s.model_dump()}
    def update(percent,message):
        with lock: jobs[ident].update(progress=percent,message=message)
    def work():
        with lock: jobs[ident]['status']='running'
        try:
            info=build_project(s,OUTPUT/ident,update)
            with lock: jobs[ident].update(status='complete',progress=100,message='Ready to print',result=info)
        except Exception as exc:
            logging.exception('Generation failed: %s',ident)
            with lock: jobs[ident].update(status='failed',message=str(exc))
    try:
        executor.submit(work)
    except Exception:
        with lock: jobs[ident].update(status='failed',message='Could not start generation. Please try again.')
        raise HTTPException(503,'Could not start generation. Please try again.')
    return {'id':ident}


def project_root(ident):
    root=(OUTPUT/ident).resolve()
    if root.parent!=OUTPUT.resolve():
        raise HTTPException(400,'Invalid project ID.')
    return root


def completed_project(root):
    """A damaged or interrupted export must never take down the library."""
    info=root/'model-info.json'
    archive=root/'project.zip'
    if not info.is_file() or not archive.is_file() or not zipfile.is_zipfile(archive):
        return None
    try:
        data=json.loads(info.read_text(encoding='utf-8'))
        if not isinstance(data,dict) or not isinstance(data.get('name'),str) or not data['name'].strip():
            raise ValueError('Missing project name')
        if not isinstance(data.get('created_at'),str) or not isinstance(data.get('layout'),dict):
            raise ValueError('Missing project date or layout')
        if any(not isinstance(data['layout'].get(k),int) or data['layout'][k] < 1 for k in ('columns','rows')):
            raise ValueError('Invalid project layout')
        if not isinstance(data.get('settings',{}),dict) or not isinstance(data.get('parts',[]),list):
            raise ValueError('Invalid project settings or parts')
        return data
    except (OSError,ValueError,TypeError) as exc:
        logging.warning('Skipping unreadable project %s: %s',root.name,exc)
        return None


@app.get('/api/active-job')
def active_job():
    # All tabs belong to this local installation. Reattach after a refresh
    # instead of leaving its worker busy with no visible progress.
    with lock:
        return next((dict(j) for j in jobs.values() if j['status'] in ('queued','running')),None)


@app.get('/api/jobs/{ident}')
def job(ident:str):
    root=project_root(ident)
    with lock:
        if ident in jobs: return dict(jobs[ident])
    info=completed_project(root)
    if info is not None:
        return {'id':ident,'status':'complete','progress':100,'message':'Ready to print','result':info,'settings':info.get('settings')}
    raise HTTPException(404,'Project not found.')


@app.get('/api/projects')
def projects():
    result=[]
    for path in sorted(OUTPUT.glob('*/model-info.json'),key=lambda p:p.stat().st_mtime,reverse=True):
        if path.parent.resolve().parent!=OUTPUT.resolve(): continue
        info=completed_project(path.parent)
        if info is None: continue
        settings=info.get('settings',{})
        result.append({'id':path.parent.name,'name':info['name'],'created_at':info['created_at'],'layout':info['layout'],
                       'width':settings.get('width'),'height':settings.get('height'),
                       'frame_mode':settings.get('frame_mode'),'terrain_style':settings.get('terrain_style','smooth'),
                       'part_count':len(info.get('parts',[]))})
        if len(result)>=500: break
    return result


@app.get('/api/files/{ident}/{path:path}')
def files(ident:str,path:str):
    root=project_root(ident)
    target=(root/path).resolve()
    if not target.is_relative_to(root) or not target.is_file(): raise HTTPException(404,'File not found.')
    if not (root/'project.zip').is_file(): raise HTTPException(409,'Project is still being generated or failed validation.')
    return FileResponse(target,filename=target.name if target.suffix in ('.zip','.stl','.3mf') else None)


bambu_lock = Lock()


@app.post('/api/projects/{ident}/bambu')
def bambu_project(ident: str, request: Request, launch: bool = False):
    origin = request.headers.get('origin')
    if origin and origin != str(request.base_url).rstrip('/'):
        raise HTTPException(403, 'Open Bambu Studio from this local workspace.')
    if request.headers.get('sec-fetch-site') == 'cross-site':
        raise HTTPException(403, 'Open Bambu Studio from this local workspace.')
    root = project_root(ident)
    info = completed_project(root)
    if info is None:
        raise HTTPException(409, 'Generate a complete model before opening Bambu Studio.')
    from .bambu import prepare_project, launch_projects, REVISION
    with bambu_lock:
        try:
            manifest_path = root / 'Bambu/plates.json'
            manifest = json.loads(manifest_path.read_text()) if manifest_path.is_file() else None
            if (not manifest or manifest.get('revision') != REVISION
                    or not manifest.get('files')
                    or not all((root / file).resolve().is_relative_to(root) and (root / file).is_file() for file in manifest['files'])):
                manifest = prepare_project(root, info)
            if launch:
                launch_projects([(root / file).resolve() for file in manifest['files']])
            return manifest
        except FileNotFoundError as exc:
            raise HTTPException(404, str(exc))
        except ValueError as exc:
            raise HTTPException(422, str(exc))
        except Exception:
            logging.exception('Bambu project could not be opened')
            raise HTTPException(503, 'Could not open Bambu Studio. Download the plate project and open it manually.')


# The production build runs entirely from this local Python server.
if (ROOT/'dist').exists(): app.mount('/',StaticFiles(directory=ROOT/'dist',html=True),name='frontend')
