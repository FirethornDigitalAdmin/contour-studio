import numpy as np
import pytest
import trimesh
from shapely.geometry import LineString, Point, Polygon, box

from backend.config import Settings
from backend.geometry import as_trimesh, clean_mesh_faces, generate_solids, prism, supported_tree_solid, union
from backend.geodata import Geography
from backend.overpass import Downloader, selectors


def quiet(*args): pass


# Fixture coordinates remain independent of the workspace's starting location.
FIXTURE_BOUNDS = dict(west=-1.352, east=-1.278, south=53.498586, north=53.527414)


def settings(**updates):
    return Settings(name='Test terrain',bounds=FIXTURE_BOUNDS,width=120,height=100,resolution=64,frame_mode='none',
                    joints=False,labels=False,**updates)


def source(xs,ys,geo):
    dem=np.add.outer(np.sin(ys/8)*10,np.cos(xs/7)*9)
    return dem,[('forest',box(5,5,55,95),{}),('field',box(65,5,115,95),{}),
                ('grass',box(55,5,65,95),{}),
                ('water',LineString([(5,50),(115,50)]),{}),
                ('road',LineString([(60,5),(60,95)]),{}),
                ('building',box(75,20,85,30),{'height':'8'})]


def test_new_controls_validate_and_old_design_defaults_are_preserved():
    s=Settings()
    assert s.water_style=='carved' and s.water_bank==0
    assert not s.forests and not s.fields and not s.multicolour
    for change in [dict(tree_height=0),dict(tree_spacing=20),dict(field_angle=181),
                   dict(colour_water='blue'),dict(colour_depth=3),dict(water_style='flat')]:
        with pytest.raises(ValueError): Settings(**change)


@pytest.mark.parametrize('water_style',['carved','smooth'])
def test_water_beds_and_banks_remain_connected_above_minimum_base(water_style):
    s=settings(water_style=water_style,water_bank=2,buildings=False,roads='none')
    parts,_=generate_solids(s,quiet,source)
    mesh=as_trimesh(parts[0]['solid'])
    assert mesh.is_volume and len(mesh.split())==1
    assert mesh.vertices[mesh.vertices[:,2]>.001,2].min()>=s.base-.001
    baseline,_=generate_solids(s.model_copy(update={'water_bank':0}),quiet,source)
    assert baseline[0]['solid'].volume()>parts[0]['solid'].volume()


def test_smooth_water_reduces_rugged_channel_geometry():
    smooth,_=generate_solids(settings(water_style='smooth',buildings=False,roads='none'),quiet,source)
    carved,_=generate_solids(settings(buildings=False,roads='none'),quiet,source)
    assert carved[0]['solid'].volume()-smooth[0]['solid'].volume()>.01


@pytest.mark.parametrize('forest_style',['canopy','trees'])
def test_optional_landcover_textures_are_deterministic_and_connected(forest_style):
    s=settings(forests=True,fields=True,forest_style=forest_style)
    parts,meta=generate_solids(s,quiet,source)
    assert meta['features']['trees']>0 and meta['features']['field_strips']>0
    mesh=as_trimesh(parts[0]['solid'])
    assert mesh.is_volume and len(mesh.split())==1
    repeat,repeated_meta=generate_solids(s,quiet,source)
    assert repeated_meta['features']==meta['features']
    assert parts[0]['solid'].volume()==pytest.approx(repeat[0]['solid'].volume(),abs=1e-7)
    assert parts[0]['solid'].bounding_box()==pytest.approx(repeat[0]['solid'].bounding_box(),abs=1e-7)
    flat,_=generate_solids(s.model_copy(update={'field_style':'flat','forests':False}),quiet,source)
    assert parts[0]['solid'].volume()>flat[0]['solid'].volume()


@pytest.mark.parametrize('frame_mode',['integrated','separate','none'])
def test_colour_regions_are_exact_disjoint_and_toggle_preserves_geometry(frame_mode):
    s=settings(forests=True,fields=True,layout='manual',columns=2,rows=1).model_copy(update={'frame_mode':frame_mode,'labels':True,'joints':True})
    mono,_=generate_solids(s,quiet,source)
    coloured,_=generate_solids(s.model_copy(update={'multicolour':True}),quiet,source)
    found=set()
    for before,after in zip(mono,coloured):
        assert before['id']==after['id']
        # Coincident boundaries can produce spurious Boolean intersection
        # volumes; independently generated parent volume and bounds agree.
        assert before['solid'].volume()==pytest.approx(after['solid'].volume(),abs=1e-7)
        assert before['solid'].bounding_box()==pytest.approx(after['solid'].bounding_box(),abs=1e-7)
        if after['kind'] not in ('terrain','frame'): continue
        regions=after['material_regions']
        found.update(regions)
        rebuilt=union(list(regions.values()))
        assert rebuilt.volume()==pytest.approx(after['solid'].volume(),abs=.001)
        assert rebuilt.bounding_box()==pytest.approx(after['solid'].bounding_box(),abs=1e-7)
        assert sum(region.volume() for region in regions.values())==pytest.approx(after['solid'].volume(),abs=.001)
        assert all(as_trimesh(region).is_volume for region in regions.values())
    assert {'forest','fields','water','buildings','ground'}<=found
    if frame_mode!='none': assert 'frame' in found


def test_tree_and_field_sampling_caps_are_reported(monkeypatch):
    import backend.geometry as geometry
    monkeypatch.setattr(geometry,'MAX_TREES',16)
    monkeypatch.setattr(geometry,'MAX_FIELD_STRIPS',12)
    _,meta=generate_solids(settings(forests=True,fields=True,tree_spacing=1.5,tree_size=1.2,field_spacing=1),quiet,source)
    assert 0<meta['features']['trees']<=16
    assert 0<meta['features']['field_strips']<=12
    assert any('16 tree positions' in warning for warning in meta['warnings'])
    assert any('12 strips' in warning for warning in meta['warnings'])


def test_smooth_water_banks_and_landcover_colour_are_printable_together():
    s=settings(forests=True,fields=True,water_style='smooth',water_bank=.8).model_copy(
        update={'frame_mode':'integrated','multicolour':True})
    parts,_=generate_solids(s,quiet,source)
    for part in parts:
        regions=part.get('material_regions',{})
        assert all(as_trimesh(region).is_volume for region in regions.values())
        assert sum(region.volume() for region in regions.values())==pytest.approx(part['solid'].volume(),abs=.001)
        assert union(list(regions.values())).volume()==pytest.approx(part['solid'].volume(),abs=.001)


def test_adjacent_small_buildings_and_draped_features_export_closed_colours(tmp_path):
    from backend.export import build_project
    # Two real mapped footprints share a skewed wall. Enhancing them and
    # re-snapping paint masks must not leave ground sheets up their walls.
    houses=[Polygon([(10.101264864862138,36.953667494959916),
                     (9.448481081086612,37.12281989948034),
                     (9.533421621651229,37.488077811739586),
                     (9.603681081112782,37.79199495874276),
                     (10.256464864886937,37.62284226692273)]),
            Polygon([(10.755621621664542,36.785444571342936),
                     (10.101264864862138,36.953667494959916),
                     (10.256464864886937,37.62284226692273),
                     (10.912394594569545,37.45554846739715)])]
    def neighbourhood(xs,ys,geo):
        return np.add.outer(ys*.4,xs*.1),[
            *[('building',house,{'building':'yes'}) for house in houses],
            ('road',LineString([(8,35),(14,40)]),{}),
            ('field',box(8,34,15,42),{})]
    s=settings(roads='raised',water=False,fields=True,multicolour=True).model_copy(
        update={'frame_mode':'separate','frame_width':6})
    info=build_project(s,tmp_path,quiet,neighbourhood)
    assert info['model']['features']['enhanced_buildings']==2
    for tile in info['multicolour']['tiles']:
        for material in tile['materials']:
            mesh=trimesh.load_mesh(tmp_path/material['file'])
            assert mesh.is_watertight and mesh.is_volume


@pytest.mark.parametrize('water',[False,True])
def test_deep_engraved_roads_keep_the_minimum_colour_layer(water):
    def flat_road(xs,ys,geo):
        return np.zeros((len(ys),len(xs))),[
            ('road',LineString([(60,5),(60,95)]),{}),
            ('water',LineString([(5,50),(115,50)]),{})]
    s=settings(roads='engraved',road_height=2,water=water,
               water_style='smooth',water_bank=.8,buildings=False,
               multicolour=True,colour_depth=.4)
    parts,_=generate_solids(s,quiet,flat_road)
    regions=parts[0]['material_regions']
    assert 'roads' in regions and all(as_trimesh(region).is_volume for region in regions.values())
    road_layer=regions['roads']^prism(box(59.9,15,60.1,30),s.printer_z)
    bounds=road_layer.bounding_box()
    assert bounds[5]-bounds[2]==pytest.approx(s.colour_depth,abs=1e-7)
    assert bounds[5]==pytest.approx(s.base,abs=1e-7)
    assert sum(region.volume() for region in regions.values())==pytest.approx(parts[0]['solid'].volume(),abs=.001)
    assert union(list(regions.values())).volume()==pytest.approx(parts[0]['solid'].volume(),abs=.001)


def test_mapped_woodland_explains_when_no_tree_crowns_fit():
    def narrow_wood(xs,ys,geo):
        return np.zeros((len(ys),len(xs))),[('forest',box(20,20,21,80),{})]
    _,meta=generate_solids(settings(forests=True,tree_size=6,buildings=False,
                                   roads='none',water=False),quiet,narrow_wood)
    assert meta['features']['forest_areas']==1 and meta['features']['trees']==0
    assert any('no tree shapes fit' in warning for warning in meta['warnings'])


def test_compact_woodland_fits_a_crown_between_sampling_grid_points():
    def compact_wood(xs,ys,geo):
        return np.zeros((len(ys),len(xs))),[('forest',box(20,20,21.6,21.6),{})]
    parts,meta=generate_solids(settings(forests=True,tree_size=1.2,tree_spacing=4,
                                      buildings=False,roads='none',water=False),quiet,compact_wood)
    assert meta['features']['trees']==1
    assert as_trimesh(parts[0]['solid']).is_volume


@pytest.mark.parametrize('tip_ratio',[.04,.65])
def test_small_tree_crown_and_pedestal_share_printable_vertices(tmp_path,tip_ratio):
    # A real mapped position whose independently generated cylinder and
    # polygon rim previously created contact edges at binary STL precision.
    footprint=Point(20.857684783637524,145.99820481836796).buffer(.6,quad_segs=4)
    tree=supported_tree_solid(footprint,7.56189716034643,1.8,tip_ratio)
    raw=tree.to_mesh64()
    mesh=trimesh.Trimesh(vertices=np.asarray(raw.vert_properties)[:,:3],
                         faces=np.asarray(raw.tri_verts),process=True)
    assert mesh.is_volume and len(mesh.faces)==96
    mesh.vertices=mesh.vertices.astype(np.float32).astype(np.float64)
    clean_mesh_faces(mesh)
    assert mesh.is_volume
    file=tmp_path/'tree.stl'
    mesh.export(file)
    assert trimesh.load_mesh(file,process=True).is_volume


def test_field_ridges_resolve_mapped_corner_contacts_before_extrusion():
    def neighbouring_fields(xs,ys,geo):
        return np.zeros((len(ys),len(xs))),[
            ('field',box(20,20,22,21.25),{}),
            ('field',box(22,21.25,24,22.5),{})]
    parts,meta=generate_solids(settings(fields=True,field_angle=0,water=False,
                                      buildings=False,roads='none'),quiet,neighbouring_fields)
    assert meta['features']['field_strips']==1
    raw=parts[0]['solid'].to_mesh64()
    mesh=trimesh.Trimesh(vertices=np.asarray(raw.vert_properties)[:,:3],
                         faces=np.asarray(raw.tri_verts),process=True)
    assert mesh.is_volume
    mesh.vertices=mesh.vertices.astype(np.float32).astype(np.float64)
    clean_mesh_faces(mesh)
    assert mesh.is_volume


def test_actual_landcover_is_requested_and_parsed_with_holes(monkeypatch):
    s=settings(forests=True,buildings=False,roads='none',water=False)
    assert any('forest|farmland|meadow|grass' in entry for entry in selectors(s))
    geo=Geography(s)
    def ring(w,e,so,n):
        return [{'lon':w,'lat':so},{'lon':e,'lat':so},{'lon':e,'lat':n},{'lon':w,'lat':n},{'lon':w,'lat':so}]
    b=s.bounds
    inner=ring(b.west+.025,b.west+.03,b.south+.01,b.south+.013)
    raw={'elements':[{'type':'relation','id':1,'tags':{'natural':'wood'},'members':[
        {'role':'outer','geometry':ring(b.west,b.east,b.south,b.north)},
        {'role':'inner','geometry':inner}]},
        {'type':'way','id':2,'tags':{'landuse':'farmland'},'geometry':ring(b.west,b.east,b.south,b.north)},
        {'type':'way','id':3,'tags':{'natural':'grassland'},'geometry':ring(b.west,b.east,b.south,b.north)}]}
    monkeypatch.setattr(Downloader,'download',lambda *a:raw)
    features,_=geo.vectors(quiet)
    assert [kind for kind,_,_ in features]==['forest','field','grass']
    assert len(features[0][1].interiors)==1
