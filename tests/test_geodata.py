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
