import io
import json

import httpx
import numpy as np
from PIL import Image
import pytest

from backend import geodata
from backend.config import Bounds,Settings

CLIENT_CLASS=httpx.Client


def install_transport(monkeypatch,handler):
    transport=httpx.MockTransport(handler)
    monkeypatch.setattr(geodata.httpx,'Client',lambda **kw:CLIENT_CLASS(transport=transport,**kw))


def test_corrupt_cache_recovers_and_network_failure_is_not_cached(tmp_path,monkeypatch):
    monkeypatch.setattr(geodata,'CACHE',tmp_path)
    path=tmp_path/'source.json'
    path.write_text('{truncated')
    calls=[]
    def handler(request):
        calls.append(request)
        return httpx.Response(200,json={'complete':True})
    install_transport(monkeypatch,handler)
    result=geodata.fetch('https://example.test/source','source.json',validate=json.loads)
    assert json.loads(result)=={'complete':True}
    assert geodata.fetch('https://example.test/source','source.json',validate=json.loads)==result
    assert len(calls)==1
    assert not list(tmp_path.glob('.geodata-*'))
    install_transport(monkeypatch,lambda request:httpx.Response(200,text='invalid JSON'))
    with pytest.raises(ValueError):
        geodata.fetch('https://example.test/source','failed.json',validate=json.loads)
    assert not (tmp_path/'failed.json').exists()


def elevation_image():
    out=io.BytesIO()
    Image.new('RGB',(256,256),(128,0,0)).save(out,format='PNG')
    return out.getvalue()


def test_tall_map_elevation_quality_uses_the_long_axis(monkeypatch):
    calls=[]
    def fetch(url,key,**kwargs):
        calls.append(url)
        return elevation_image()
    monkeypatch.setattr(geodata,'fetch',fetch)
    s=Settings(width=80,height=400,frame_mode='none',resolution=640,
               bounds=Bounds(west=0,south=0,east=.01,north=.05))
    dem,meta=geodata.Geography(s).elevation(np.linspace(0,80,129),np.linspace(0,400,641),lambda *a:None)
    assert dem.shape==(641,129)
    assert np.isfinite(dem).all()
    assert meta['zoom']==15
    assert len(calls)<=36


def test_elevation_padding_wraps_tiles_at_the_world_edge(monkeypatch):
    calls=[]
    def fetch(url,key,**kwargs):
        calls.append(url)
        return elevation_image()
    monkeypatch.setattr(geodata,'fetch',fetch)
    s=Settings(width=100,height=100,frame_mode='none',resolution=64,
               bounds=Bounds(west=179.999,south=0,east=180,north=.001))
    dem,meta=geodata.Geography(s).elevation(np.linspace(0,100,65),np.linspace(0,100,65),lambda *a:None)
    assert np.isfinite(dem).all()
    tile_columns=[int(url.split('/')[-2]) for url in calls]
    assert all(0<=column<2**meta['zoom'] for column in tile_columns)
    assert 0 in tile_columns


@pytest.mark.parametrize('failure', [geodata.OverpassUnavailable('server timeout'),
                                  geodata.OverpassUnavailable('retry budget exhausted')])
def test_large_area_map_failure_retains_terrain_with_explicit_omissions(monkeypatch, failure):
    from backend.geometry import generate_solids
    monkeypatch.setattr(geodata.Downloader, 'download', lambda *a: (_ for _ in ()).throw(failure))
    monkeypatch.setattr(geodata.Geography, 'elevation',
                        lambda self,xs,ys,progress: (np.zeros((len(ys),len(xs))), {'provider':'Test elevation'}))
    settings = Settings(bounds=Bounds(west=0,east=.2,south=0,north=.2),
                        width=100,height=100,resolution=64,frame_mode='none',labels=False,joints=False)
    parts, meta = generate_solids(settings, lambda *a: None)
    assert parts
    assert meta['osm']['terrain_only_fallback'] is True
    assert meta['dem']['provider'] == 'Test elevation'
    assert any('mapped roads, water, land cover and landmarks' in warning for warning in meta['warnings'])


def test_small_area_failure_remains_actionable_and_does_not_omit_requested_detail(monkeypatch):
    def fail(*args):
        raise geodata.OverpassUnavailable('server timeout')
    monkeypatch.setattr(geodata.Downloader, 'download', fail)
    with pytest.raises(geodata.OverpassUnavailable, match='server timeout'):
        geodata.Geography(Settings()).vectors(lambda *a:None)


def test_large_area_programming_errors_do_not_turn_into_terrain_fallback(monkeypatch):
    def fail(*args):
        raise ValueError('unexpected programming error')
    monkeypatch.setattr(geodata.Downloader, 'download', fail)
    settings=Settings(bounds=Bounds(west=0,east=.2,south=0,north=.2))
    with pytest.raises(ValueError, match='unexpected programming error'):
        geodata.Geography(settings).vectors(lambda *a:None)


def test_bridge_tags_survive_download_projection_and_map_clipping(monkeypatch):
    elements=[{'type':'way','id':i,'tags':tags,'geometry':[
        {'lon':-.001,'lat':lat},{'lon':.011,'lat':lat}]} for i,lat,tags in [
        (1,.003,{'highway':'footway','bridge':'yes','layer':'1'}),
        (2,.007,{'railway':'rail','bridge':'viaduct','layer':'1'}),
    ]]
    monkeypatch.setattr(geodata.Downloader,'download',lambda *a:{'elements':elements})
    s=Settings(width=120,height=100,frame_mode='none',railways=True,buildings=False,
               bounds=Bounds(west=0,east=.01,south=0,north=.01))
    features,meta=geodata.Geography(s).vectors(lambda *a:None)
    assert meta['skipped']==0
    assert [kind for kind,_,_ in features]==['road','railway']
    for _,geom,tags in features:
        assert tags['bridge'] in ('yes','viaduct') and tags['layer']=='1'
        assert geom.geom_type=='LineString'
        assert geom.bounds[0]>=0 and geom.bounds[2]<=s.width
