import json
import zipfile

import numpy as np
import pytest
import trimesh
from shapely.geometry import LineString, box

from backend.config import Settings
from backend.geometry import generate_solids, as_trimesh, union, frame_solid, prism, key_shape
from shapely import affinity
from backend.export import build_project
from backend.geometry import source_height


# Fixture coordinates remain independent of the workspace's starting location.
FIXTURE_BOUNDS = dict(west=-1.352, east=-1.278, south=53.498586, north=53.527414)


def fixture(xs,ys,geo):
    # Features cross both the x=200 and y=200 seams.
    dem=np.add.outer(np.sin(ys/70)*15,np.cos(xs/80)*20)
    return dem,[('road',LineString([(20,20),(580,380)]),{}),
                ('water',LineString([(20,220),(580,180)]),{}),
                ('building',box(193,194,211,212),{'height':'12'})]


def quiet(*args): pass


def test_default_layout_and_reject_oversized_manual():
    assert Settings().tile_layout()==(3,2)
    with pytest.raises(ValueError,match='exceed'):
        Settings(layout='manual',columns=2,rows=2)
    with pytest.raises(ValueError): Settings(bounds={'west':2,'east':1,'south':50,'north':51})


@pytest.mark.parametrize('mode',['integrated','separate','none'])
def test_all_parts_are_single_watertight_bed_sized_solids(mode):
    settings=Settings(name='Test terrain',bounds=FIXTURE_BOUNDS,resolution=64,frame_mode=mode)
    parts,meta=generate_solids(settings,quiet,fixture)
    terrain=[p for p in parts if p['kind']=='terrain']
    assert [p['id'] for p in terrain]==['A1','A2','A3','B1','B2','B3']
    assert terrain[1]['neighbours']=={'north':None,'east':'A3','south':'B2','west':'A1'}
    for part in parts:
        mesh=as_trimesh(part['solid'])
        assert mesh.is_volume and mesh.is_watertight,part['id']
        assert len(mesh.split())==1,part['id']
        assert np.all(mesh.extents<=np.array([210,210,250])+0.001)
        assert abs(mesh.bounds[0,2])<0.00001
    assert len(meta['joints'])>=14


def test_global_geometry_is_preserved_across_tile_cuts():
    s=Settings(name='Test terrain',bounds=FIXTURE_BOUNDS,resolution=64,labels=False,joints=False,frame_mode='integrated')
    tiled,meta=generate_solids(s,quiet,fixture)
    # Reassemble the exact Boolean pieces and compare volume to the original complete model.
    rebuilt=union([p['solid'] for p in tiled])
    assert rebuilt.volume()==pytest.approx(meta['whole_volume_mm3'],abs=0.001)
    single=s.model_copy(update={'printer_width':700,'printer_height':500})
    whole,_=generate_solids(single,quiet,fixture)
    assert (rebuilt-whole[0]['solid']).volume()<0.001
    assert (whole[0]['solid']-rebuilt).volume()<0.001
    # Triangle surfaces at both sides of a cut must have the same geometric boundary.
    a=as_trimesh(tiled[0]['solid']); b=as_trimesh(tiled[1]['solid'])
    def edge_segments(mesh,x):
        f=mesh.triangles[np.all(np.isclose(mesh.triangles[:,:,0],x,atol=1e-5),axis=1)]
        from shapely.geometry import Polygon
        from shapely.ops import unary_union
        return unary_union([Polygon(t[:,1:]) for t in f])
    assert edge_segments(a,200).symmetric_difference(edge_segments(b,200)).area<0.001


def test_seam_allowance_does_not_shift_assembled_positions():
    s=Settings(name='Test terrain',bounds=FIXTURE_BOUNDS,resolution=64,seam=0.2,labels=False,joints=False,roads='none',water=False,buildings=False)
    parts,_=generate_solids(s,quiet,fixture)
    a=as_trimesh(parts[0]['solid']); b=as_trimesh(parts[1]['solid'])
    assert b.bounds[0,0]-a.bounds[1,0]==pytest.approx(0.2,abs=0.00001)


def test_complete_export_round_trip(tmp_path):
    info=build_project(Settings(name='Test terrain',bounds=FIXTURE_BOUNDS,resolution=64),tmp_path,quiet,fixture)
    assert (tmp_path/'assembly-guide.svg').is_file()
    assert (tmp_path/'preview.glb').stat().st_size>1000
    for part in info['parts']:
        mesh=trimesh.load_mesh(tmp_path/part['file'])
        assert mesh.is_volume and mesh.is_watertight,part['id']
        assert np.allclose(mesh.bounds[0],0,atol=0.00001)
    assert len(info['parts'])==9
    with zipfile.ZipFile(tmp_path/'project.zip') as archive:
        assert any(n.endswith('model-info.json') for n in archive.namelist())
    with zipfile.ZipFile(tmp_path/'Assembly.3mf') as archive:
        assert '3D/3dmodel.model' in archive.namelist()
    assert json.loads((tmp_path/'model-info.json').read_text())['units']=='mm'


def test_excess_height_blocks_export(tmp_path):
    s=Settings(name='Test terrain',bounds=FIXTURE_BOUNDS,resolution=64,printer_z=20,exaggeration=30)
    with pytest.raises(ValueError,match='exceed'):
        build_project(s,tmp_path,quiet,fixture)
    assert not (tmp_path/'project.zip').exists()


def small_fixture(xs, ys, geo):
    return np.zeros((len(ys), len(xs))), [('building', box(45, 45, 45.2, 45.3), {})]


@pytest.mark.parametrize('policy,kept', [('enhance', 1), ('keep', 1), ('omit', 0)])
def test_small_building_policy(policy, kept):
    s = Settings(name='Test terrain',bounds=FIXTURE_BOUNDS,width=100, height=100, resolution=64, frame_mode='none',
                 joints=False, labels=False, roads='none', water=False, small_buildings=policy)
    parts, meta = generate_solids(s, quiet, small_fixture)
    assert meta['features']['buildings'] == kept
    assert meta['features']['enhanced_buildings'] == (1 if policy == 'enhance' else 0)
    assert as_trimesh(parts[0]['solid']).is_volume
    if policy == 'enhance':
        assert parts[0]['solid'].volume() > 100*100*s.base + 0.8*0.8*s.building_min_height


@pytest.mark.parametrize('symbol', ['heart', 'star', 'pin'])
def test_markers_clear_roofs_and_export_as_connected_solids(symbol, tmp_path):
    def data(xs, ys, geo):
        return np.zeros((len(ys), len(xs))), [('building', box(45, 45, 55, 55), {'height': '80'})]
    s = Settings(name='Test terrain',bounds=FIXTURE_BOUNDS,width=100, height=100, resolution=64, frame_mode='none',
                 joints=False, labels=False, roads='none', water=False,
                 markers=[dict(id='home', label='Home', symbol=symbol, lon=-1.315,
                               lat=53.513, size=8, rise=4)])
    info = build_project(s, tmp_path, quiet, data)
    assert info['model']['features']['markers'] == 1
    baseline, _ = generate_solids(s.model_copy(update={'markers': []}), quiet, data)
    assert info['parts'][0]['dimensions_mm'][2] == pytest.approx(as_trimesh(baseline[0]['solid']).bounds[1,2]+4, abs=0.001)
    assert info['parts'][0]['components'] == 1
    assert info['settings']['markers'][0]['symbol'] == symbol


def test_marker_edge_and_printer_height_rejected(tmp_path):
    common = dict(name='Test terrain', bounds=FIXTURE_BOUNDS, width=100, height=100, resolution=64, frame_mode='none', joints=False, labels=False)
    with pytest.raises(ValueError, match='too close'):
        generate_solids(Settings(**common, markers=[dict(id='edge',lon=-1.352,lat=53.513)]), quiet, small_fixture)
    with pytest.raises(ValueError, match='exceed'):
        build_project(Settings(**common, printer_z=20, markers=[dict(id='high',lon=-1.315,lat=53.513,rise=20)]), tmp_path, quiet, small_fixture)
    assert not (tmp_path/'project.zip').exists()


@pytest.mark.parametrize('style', ['realistic', 'uniform', 'stepped'])
def test_building_styles_change_printable_height(style):
    def data(xs, ys, geo):
        return np.zeros((len(ys), len(xs))), [('building',box(40,40,60,60),{'height':'80'})]
    s=Settings(name='Test terrain',bounds=FIXTURE_BOUNDS,width=100,height=100,resolution=64,frame_mode='none',joints=False,labels=False,
               water=False,roads='none',building_style=style)
    parts,_=generate_solids(s,quiet,data)
    mesh=as_trimesh(parts[0]['solid'])
    assert mesh.is_volume
    from backend.geodata import Geography
    relief=max(s.building_min_height,(s.building_height if style=='uniform' else 80)*Geography(s).scale*s.building_exaggeration)
    assert mesh.bounds[1,2]==pytest.approx(s.base+relief*(1.3 if style=='stepped' else 1),abs=0.001)


@pytest.mark.parametrize('tags,expected', [({'height':'12 m'},12),({'height':12},12),
    ({'height':'30 ft'},9.144),({'height':"30'"},9.144),({'height':'30 feet'},9.144),
    ({'height':'unknown','building:levels':'4'},12),({'height':'-6','building:levels':'2'},6),
    ({'height':'nan'},8),({'height':'inf'},8),({'building:levels':'NaN'},8),
    ({'building:levels':-2},8),({'height':'0'},8),({'height':'1.2e2'},120),({'height':'1e999'},8)])
def test_source_building_heights_have_safe_units_and_fallbacks(tags,expected):
    assert source_height(tags,8) == pytest.approx(expected)


def test_invalid_building_heights_still_produce_connected_geometry():
    def data(xs,ys,geo):
        return np.zeros((len(ys),len(xs))),[
            ('building',box(10,10,20,20),{'building:levels':'nan'}),
            ('building',box(30,30,40,40),{'height':'-9'}),
            ('building',box(50,50,60,60),{'height':12})]
    s=Settings(name='Test terrain',bounds=FIXTURE_BOUNDS,width=100,height=100,resolution=64,frame_mode='none',joints=False,
               labels=False,water=False,roads='none')
    parts,meta=generate_solids(s,quiet,data)
    assert meta['features']['buildings'] == 3
    mesh=as_trimesh(parts[0]['solid'])
    assert mesh.is_volume and len(mesh.split()) == 1


def test_archive_is_published_atomically_and_omits_stale_files(tmp_path,monkeypatch):
    (tmp_path/'stale-file.stl').write_text('old artifact')
    original=zipfile.ZipFile.write
    def inspect_write(archive,*args,**kwargs):
        assert not (tmp_path/'project.zip').exists()
        return original(archive,*args,**kwargs)
    monkeypatch.setattr(zipfile.ZipFile,'write',inspect_write)
    build_project(Settings(name='Test terrain',bounds=FIXTURE_BOUNDS,resolution=64),tmp_path,quiet,fixture)
    with zipfile.ZipFile(tmp_path/'project.zip') as archive:
        assert archive.testzip() is None
        assert not any('stale-file' in name for name in archive.namelist())
        assert not any('.tmp' in name for name in archive.namelist())
    assert not (tmp_path/'.project.zip.tmp').exists()


def test_archive_write_failure_never_publishes_a_package(tmp_path,monkeypatch):
    def fail(*args,**kwargs):
        raise OSError('Disk write failed')
    monkeypatch.setattr(zipfile.ZipFile,'write',fail)
    with pytest.raises(OSError,match='Disk write failed'):
        build_project(Settings(name='Test terrain',bounds=FIXTURE_BOUNDS,resolution=64),tmp_path,quiet,fixture)
    assert not (tmp_path/'project.zip').exists()
    assert not (tmp_path/'.project.zip.tmp').exists()


def test_assembly_guide_describes_only_enabled_hardware(tmp_path):
    s=Settings(name='Test terrain',bounds=FIXTURE_BOUNDS,width=100,height=100,resolution=64,frame_mode='none',joints=False,labels=False)
    build_project(s,tmp_path,quiet,small_fixture)
    guide=(tmp_path/'assembly-guide.svg').read_text()
    assert 'Fit_Left' not in guide
    assert 'rear TOP arrows' not in guide
    assert 'separate frame pieces' not in guide
    assert 'Print each STL flat side down' in guide
    from xml.etree import ElementTree as ET
    svg=ET.fromstring(guide)
    text=svg.findall('{http://www.w3.org/2000/svg}text')
    assert max(float(t.attrib['y']) for t in text) < float(svg.attrib['height'])


@pytest.mark.parametrize('radius', [0, 2, 10])
def test_frame_bevel_has_no_unsupported_inner_overhang(radius):
    s=Settings(width=120,height=100,frame_mode='integrated',corner_radius=radius)
    frame=as_trimesh(frame_solid(s))
    # Downward faces on an ordinary frame belong only to its flat back;
    # the inner and outer bevels must both taper towards the front.
    underside=frame.triangles[frame.face_normals[:,2]<-0.01]
    assert np.max(underside[:,:,2])==pytest.approx(0,abs=1e-7)
    assert frame.is_volume and len(frame.split())==1


@pytest.mark.parametrize('radius', [0, 2, 10])
@pytest.mark.parametrize('joints', [False, True])
def test_separate_frame_lip_supports_clearanced_insert_and_rear_keys(radius,joints):
    def flat(xs,ys,geo): return np.zeros((len(ys),len(xs))),[]
    s=Settings(width=120,height=100,resolution=64,frame_mode='separate',corner_radius=radius,
               joints=joints,labels=False,water=False,roads='none',buildings=False)
    parts,meta=generate_solids(s,quiet,flat)
    terrain=union([p['solid'] for p in parts if p['kind']=='terrain'])
    frame=union([p['solid'] for p in parts if p['kind']=='frame'])
    fit=meta['frame_fit']; fw=s.frame_width
    assert meta['geometry_revision']=='flat-colour-depth-v5'
    assert fit=={'lip_width_mm':2.0,'lip_height_mm':2.0,'clearance_mm':s.tolerance,'seat_angle_degrees':45,'assembly':'chamfered-insert'}
    assert (terrain^frame).volume()<1e-7
    # Away from a key, frame and insert share the same 45-degree seat.
    seat=prism(box(fw+s.tolerance+0.1,30,fw+1.8,32),2)
    assert (frame^seat).volume()>0
    assert (terrain^seat).volume()>0
    assert (frame^seat).volume()+(terrain^seat).volume()==pytest.approx(seat.volume(),abs=1e-7)
    supported_insert=prism(box(fw+s.tolerance+0.1,30,fw+1.8,32),1,2)
    assert (terrain^supported_insert).volume()==pytest.approx(supported_insert.volume(),abs=1e-7)
    # The insert retains its flat central back and a straight upper wall.
    bounds=terrain.bounding_box()
    assert bounds[0]==pytest.approx(fw+s.tolerance,abs=1e-7)
    assert bounds[2]==pytest.approx(0,abs=1e-7)
    if joints:
        lower_joint=next(j for j in meta['joints'] if j['kind']=='frame' and j['y']==fw+2)
        key=affinity.translate(affinity.rotate(key_shape(),lower_joint['angle'],origin=(0,0)),lower_joint['x'],lower_joint['y'])
        assert (terrain^prism(key,1.6)).volume()<1e-7
        assert (frame^prism(key,1.6)).volume()<1e-7
        assert (frame^prism(key,0.1,1.9)).volume()>0
        assert (terrain^prism(key,0.1,1.9)).volume()>0
    for part in parts:
        mesh=as_trimesh(part['solid'])
        assert mesh.is_volume and mesh.is_watertight and len(mesh.split())==1,part['id']
    if not joints:
        insert_mesh=as_trimesh(terrain)
        below=insert_mesh.face_normals[(insert_mesh.face_normals[:,2]<-0.01)&
                                      (insert_mesh.triangles_center[:,2]>1e-7)]
        assert len(below)>0
        # All underside perimeter faces are exactly45°, including corner
        # mitres, with no horizontal cantilever above the print-bed plane.
        assert np.allclose(below[:,2],-2**-.5,atol=1e-7)


@pytest.mark.parametrize('mode', ['integrated','separate','none'])
@pytest.mark.parametrize('style', ['smooth','terraced','sculpted','faceted'])
def test_crossing_features_keep_supported_landscape_perimeter(mode,style):
    def crossing(xs,ys,geo):
        dem=np.add.outer(np.sin(ys/8)*12,np.cos(xs/7)*15)
        return dem,[('road',LineString([(-10,-10),(130,110)]),{}),
                    ('water',LineString([(-10,70),(130,30)]),{}),
                    ('building',box(-5,20,18,40),{'height':'20','roof:shape':'gabled','roof:height':'5'}),
                    ('forest',box(-10,75,35,110),{}),('field',box(70,-10,130,35),{})]
    s=Settings(width=120,height=100,resolution=64,frame_mode=mode,terrain_style=style,
               forests=True,fields=True,joints=False,labels=False,water_bank=1)
    parts,_=generate_solids(s,quiet,crossing)
    for part in parts:
        mesh=as_trimesh(part['solid'])
        assert mesh.is_volume and mesh.is_watertight and len(mesh.split())==1
        assert np.all(mesh.bounds[0,:2]>=-1e-7)
        assert np.all(mesh.bounds[1,:2]<=[s.width+1e-7,s.height+1e-7])
        if part['kind']=='terrain':
            # Feature layers must remain heightfields above the base. Rear
            # rebates/labels/keys are deliberate underside assembly features.
            downward=mesh.triangles[mesh.face_normals[:,2]<-0.01]
            assert np.max(downward[:,:,2])<=s.base+1e-6


def test_separate_frame_pack_records_lip_and_assembly_fit(tmp_path):
    s=Settings(name='Lip fit',width=120,height=100,resolution=64,frame_mode='separate',
               joints=False,labels=False,roads='none',water=False,buildings=False)
    info=build_project(s,tmp_path,quiet,lambda xs,ys,geo:(np.zeros((len(ys),len(xs))),[]))
    assert info['model']['frame_fit']['lip_width_mm']==2
    assert 'matching 45-degree underside chamfer' in (tmp_path/'assembly-guide.svg').read_text()
    for part in info['parts']:
        mesh=trimesh.load_mesh(tmp_path/part['file'])
        assert mesh.is_volume and mesh.is_watertight and len(mesh.split())==1


@pytest.mark.parametrize('mode', ['integrated','separate'])
@pytest.mark.parametrize('profile', [dict(frame_width=5,inner_bevel=4,outer_bevel=.8,corner_radius=0),
                                    dict(frame_width=15,inner_bevel=4,outer_bevel=4,corner_radius=15)])
def test_caption_stays_attached_on_narrow_and_rounded_frame_faces(tmp_path,mode,profile):
    s=Settings(name='Front caption',width=120,height=100,resolution=64,frame_mode=mode,
               joints=False,labels=False,roads='none',water=False,buildings=False,front_caption=True,**profile)
    info=build_project(s,tmp_path,quiet,lambda xs,ys,geo:(np.zeros((len(ys),len(xs))),[]))
    assert all(part['watertight'] and part['components']==1 for part in info['parts'])
