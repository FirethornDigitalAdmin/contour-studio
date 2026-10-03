import json
import numpy as np
import pytest
import trimesh
from shapely.geometry import box
from backend.config import Settings, CustomBuilding
from backend.geodata import Geography
from backend.custom_buildings import merge_custom_buildings
from backend.export import build_project

BOUNDS=dict(west=-1.352,east=-1.278,south=53.498586,north=53.527414)
POINTS=[[-1.330,53.510],[-1.324,53.510],[-1.324,53.516],[-1.330,53.516]]
def settings(**kwargs):
    return Settings(bounds=BOUNDS,custom_buildings=[dict(id='house',label='Home',height=30,points=POINTS)],**kwargs)

def test_outline_validation_and_unique_ids():
    for points in [POINTS[:2],[[0,0],[1,1],[0,1],[1,0]],[[0,0],[1,0],[2,0]],[[181,0],[179,0],[179,1]]]:
        with pytest.raises(ValueError): CustomBuilding(id='bad',points=points)
    s=settings()
    with pytest.raises(ValueError): Settings(custom_buildings=[s.custom_buildings[0],s.custom_buildings[0]])
    CustomBuilding(id='dateline',points=[[179.99,0],[-179.99,0],[-179.99,.01],[179.99,.01]])

def test_authored_overlap_preserves_neighbour_and_height():
    s=settings();geo=Geography(s)
    added,count=merge_custom_buildings([],s,geo); footprint=added[0][1]
    original=footprint.buffer(5);neighbour=box(20,20,25,25)
    merged,count=merge_custom_buildings([('building',original,{'height':'12'}),('building',neighbour,{})],s,geo)
    assert count==1 and len(merged)==3
    assert merged[0][1].intersection(footprint).area < 1e-8
    assert merged[0][1].area == pytest.approx(original.area-footprint.area)
    assert merged[1][1].equals(neighbour)
    assert merged[2][2]['height']=='30.0'
    assert merge_custom_buildings([],settings(buildings=False),geo)==([],0)

def test_clip_and_outside_buildings():
    s=settings();geo=Geography(s)
    s.custom_buildings[0].points=[[-1.5,53.51],[-1.4,53.51],[-1.4,53.52]]
    assert merge_custom_buildings([],s,geo)==([],0)

def test_saved_print_pack_contains_watertight_authored_building(tmp_path):
    s=settings(width=120,height=100,resolution=64,frame_mode='none',roads='none',water=False,
               joints=False,labels=False,small_buildings='keep',building_style='uniform',building_height=2,building_min_height=.2)
    flat=lambda xs,ys,geo:(np.zeros((len(ys),len(xs))),[])
    info=build_project(s,tmp_path,lambda *args:None,flat)
    assert info['model']['custom_buildings']==1
    assert info['model']['features']['buildings']==1
    assert info['settings']['custom_buildings'][0]['label']=='Home'
    saved=json.loads((tmp_path/'model-info.json').read_text())
    assert saved['settings']['custom_buildings'][0]['height']==30
    for p in info['parts']:
        if p['kind']=='terrain':
            mesh=trimesh.load_mesh(tmp_path/p['file'])
            assert mesh.is_volume and mesh.is_watertight and len(mesh.split())==1
            # Custom height must survive the global uniform-height style.
            assert mesh.bounds[1,2] > s.base+.6
    assert (tmp_path/'preview.glb').stat().st_size>0
    assert (tmp_path/'project.zip').stat().st_size>0


def test_footprint_endpoint_projects_exact_source_outlines(monkeypatch):
    from fastapi.testclient import TestClient
    from backend.app import app
    def fixture(geo, progress):
        return [('building',box(geo.inset,geo.inset,geo.inset+geo.map_width/2,geo.inset+geo.map_height/2),{})], {'provider':'Fixture'}
    monkeypatch.setattr(Geography,'vectors',fixture)
    response=TestClient(app).post('/api/footprints',json=settings().model_dump())
    assert response.status_code==200
    data=response.json()
    assert data['attribution']=='Fixture'
    points=data['features'][0]['geometry']['coordinates'][0]
    assert set(x for x,y in points)=={0,500}
    assert set(y for x,y in points)=={500,1000}


def test_reference_image_is_portable_and_rejects_external_urls():
    s=settings()
    image=dict(data='data:image/jpeg;base64,aGVsbG8=',bounds=BOUNDS,x=500,y=300,width=1000,aspect=1.5,rotation=10,opacity=.6)
    loaded=Settings.model_validate({**s.model_dump(),'reference_image':image})
    restored=Settings.model_validate_json(loaded.model_dump_json())
    assert restored.reference_image.data==image['data']
    for bad in [dict(data='https://example.com/image.jpg'),dict(width=0),dict(rotation=float('inf'))]:
        with pytest.raises(ValueError): Settings.model_validate({**s.model_dump(),'reference_image':{**image,**bad}})
