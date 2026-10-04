import json
import numpy as np
import pytest
from shapely.geometry import Point, LineString, Polygon, box
from backend.config import Settings
from backend.geodata import Geography
from backend.overpass import Downloader, selectors
from backend import trees
from backend.geometry import mapped_tree_geometry, prism, as_trimesh, generate_solids, union, clean_mesh_faces


def settings(**kwargs):
    return Settings(bounds=dict(west=-1.33,east=-1.32,south=53.51,north=53.52),
        width=100,height=100,resolution=64,frame_mode='none',joints=False,labels=False,
        forests=True,roads='none',water=False,buildings=False,**kwargs)


def test_osm_tree_positions_and_closed_rows_are_preserved(monkeypatch):
    geo=Geography(settings())
    raw={'elements':[
        {'type':'node','id':1,'lon':-1.325,'lat':53.515,'tags':{'natural':'tree'}},
        {'type':'way','id':2,'tags':{'natural':'tree_row'},'geometry':[
            {'lon':-1.328,'lat':53.512},{'lon':-1.322,'lat':53.512},
            {'lon':-1.322,'lat':53.518},{'lon':-1.328,'lat':53.512}]}]}
    monkeypatch.setattr(Downloader,'download',lambda *a:raw)
    monkeypatch.setattr(trees,'download',lambda *a:([],{}))
    features,_=geo.vectors(lambda *a:None)
    assert features[0][0]=='tree' and features[0][1].equals(Point(*geo.point(-1.325,53.515)))
    assert features[1][0]=='tree_row' and features[1][1].geom_type=='LineString'
    assert 'node[natural=tree]' in selectors(settings())
    assert 'way[natural=tree_row]' in selectors(settings())
    assert not any('tree_row' in x for x in selectors(settings().model_copy(update={'forests':False})))


def test_canopy_pagination_holes_and_failure_are_not_synthetic(monkeypatch):
    geo=Geography(settings())
    monkeypatch.setattr(trees,'LAYERS',['https://example.test/layer'])
    monkeypatch.setattr(trees,'PAGE_SIZE',1)
    ring=[[-1.329,53.511],[-1.321,53.511],[-1.321,53.519],[-1.329,53.519],[-1.329,53.511]]
    hole=[[-1.326,53.514],[-1.324,53.514],[-1.324,53.516],[-1.326,53.516],[-1.326,53.514]]
    offsets=[]
    def fetch(url,key,ttl,params,validate):
        if not url.endswith('/query'):
            result={'extent':dict(xmin=-2,ymin=53,xmax=-1,ymax=54,spatialReference={'wkid':4326})}
        else:
            offsets.append(params['resultOffset'])
            result={'type':'FeatureCollection','features':[] if params['resultOffset'] else [
                {'type':'Feature','geometry':{'type':'Polygon','coordinates':[ring,hole]},'properties':{'OBJECTID':1}}]}
        value=json.dumps(result).encode();validate(value);return value
    features,meta=trees.download(geo,fetch,lambda *a:None)
    assert offsets==[0,1] and meta['status']=='loaded'
    assert features[0][0]=='tree_canopy' and len(features[0][1].interiors)==1
    assert meta['license']=='Open Government Licence v3.0'
    def fail(*a,**kw): raise ValueError('offline')
    features,meta=trees.download(geo,fail,lambda *a:None)
    assert not features and meta['status']=='unavailable' and 'offline' in meta['warning']


def test_real_rows_and_patches_do_not_invent_crowns_or_fill_holes():
    s=settings(forest_style='trees')
    canopy=box(50,20,80,80).difference(box(60,40,70,60))
    features=[('tree',Point(15,15),{}),('tree',Point(30,30),{}),
              ('tree_row',LineString([(10,45),(40,45)]),{}),('tree_canopy',canopy,{})]
    excluded=box(25,25,35,35)
    original=prism(box(0,0,100,100),4)
    solid,footprint,counts=mapped_tree_geometry(features,excluded,box(0,0,100,100),original,s,
        lambda pts:np.full(len(pts),4.),30)
    assert counts==dict(mapped_trees=1,tree_rows=1,tree_canopies=1,omitted_tree_details=1)
    assert not footprint.intersects(box(61,41,69,59)) and not footprint.intersects(excluded)
    assert footprint.covers(Point(15,15)) and footprint.covers(Point(22,45))
    assert as_trimesh(original+solid).is_volume


def test_mapped_detail_exports_with_forest_colour_and_no_woodland_texture(tmp_path):
    s=settings(multicolour=True)
    def source(xs,ys,geo):
        return np.zeros((len(ys),len(xs))),[
            ('tree',Point(15,15),{}),('tree_row',LineString([(20,30),(70,30)]),{}),
            ('tree_canopy',box(50,50,80,80).difference(box(60,60,70,70)),{})]
    parts,meta=generate_solids(s,lambda *a:None,source)
    assert meta['features']['trees']==0 and meta['features']['mapped_trees']==1
    assert meta['features']['tree_rows']==1 and meta['features']['tree_canopies']==1
    for part in parts:
        regions=part['material_regions']
        assert 'forest' in regions
        assert sum(x.volume() for x in regions.values())==pytest.approx(part['solid'].volume(),abs=.001)
        assert all(as_trimesh(x).is_volume for x in regions.values())
        file=tmp_path/(part['id']+'.stl')
        mesh=as_trimesh(part['solid'],ensure_stl=True)
        mesh.vertices=mesh.vertices.astype(np.float32).astype(np.float64)
        clean_mesh_faces(mesh)  # Match the production binary STL exporter.
        mesh.export(file)
        import trimesh
        assert trimesh.load_mesh(file).is_volume


@pytest.mark.parametrize('width,height',[(1.2,.4),(2.4,1.8),(6,.4),(6,5)])
def test_point_tree_has_supported_stem_and_rounded_crown(width,height):
    from backend.geometry import supported_tree_solid
    footprint=Point(10,10).buffer(width/2,quad_segs=4)
    solid=supported_tree_solid(footprint,4,height,.04,rooted=True,stem_width=.8)
    vertices=as_trimesh(solid).vertices
    lower=vertices[np.isclose(vertices[:,2],4+height*.25)]
    crown=vertices[np.isclose(vertices[:,2],4+height*.60)]
    low_radius=np.linalg.norm(lower[:,:2]-[10,10],axis=1).max()
    top_radius=np.linalg.norm(crown[:,:2]-[10,10],axis=1).max()
    assert low_radius*2>=.8-1e-6
    assert top_radius-low_radius<=height*.35+1e-6  # No unsupported crown flare.
    assert as_trimesh(solid).is_volume


def test_canopy_roof_is_curved_and_lobed_not_a_flat_building_top():
    from backend.geometry import rounded_canopy_solid
    s=settings()
    footprint=box(5,5,12,12)
    solid=rounded_canopy_solid(footprint,prism(box(0,0,20,20),4),s,
        lambda pts:np.full(len(pts),4.),20)
    mesh=as_trimesh(solid)
    roof=mesh.vertices[mesh.vertices[:,2]>4.2]
    assert np.ptp(roof[:,2])>s.tree_height*.5
    assert len(np.unique(np.round(roof[:,2],2)))>20
    assert solid.volume()>0 and mesh.is_volume
