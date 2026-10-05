import numpy as np
import pytest
from shapely.geometry import Point
from backend.artwork_shapes import OUTLINES, artwork_outline
from backend.config import Settings
from backend.geometry import generate_solids, as_trimesh, union


def shaped(shape='circle', **values):
    return Settings(width=160, height=160, artwork_shape=shape, frame_mode='none',
                    labels=False, joints=False, resolution=64, roads='none', water=False,
                    buildings=False, forests=False, **values)

def flat(xs, ys, geo):
    return np.zeros((len(ys), len(xs))), []

@pytest.mark.parametrize('key', OUTLINES)
def test_shared_outlines_are_valid_and_fill_the_requested_size(key):
    s=shaped('letter' if len(key)==1 else key, **({'artwork_letter':key} if len(key)==1 else {}))
    area=artwork_outline(s)
    assert area.is_valid and area.area > 0
    assert area.bounds == pytest.approx((0,0,160,160))

@pytest.mark.parametrize('shape,letter', [('circle','A'),('heart','A'),('star','A'),('letter','O'),('letter','B'),('letter','A'),('letter','I')])
def test_generated_shapes_preserve_outline_holes_and_printable_solids(shape,letter):
    s=shaped(shape,artwork_letter=letter)
    parts,meta=generate_solids(s,lambda *a:None,flat)
    area=artwork_outline(s)
    assert meta['whole_volume_mm3']==pytest.approx(area.area*s.base, rel=1e-5)
    for part in parts:
        mesh=as_trimesh(part['solid'],ensure_stl=True)
        assert mesh.is_volume and mesh.is_watertight and len(mesh.split())==1
        assert area.buffer(.001).covers(Point(*mesh.vertices[0,:2]))

@pytest.mark.parametrize('colour', [False,True])
def test_tiled_letter_preserves_all_volume_and_colour(colour):
    s=shaped('letter',artwork_letter='A',printer_width=90,printer_height=90,multicolour=colour)
    parts,meta=generate_solids(s,lambda *a:None,flat)
    assert union([p['solid'] for p in parts]).volume()==pytest.approx(meta['whole_volume_mm3'],abs=.001)
    for part in parts:
        mesh=as_trimesh(part['solid'],ensure_stl=True)
        assert len(mesh.split())==1 and mesh.is_volume
        assert max(mesh.extents[:2])<=80.001
        if colour:
            assert union(list(part['material_regions'].values())).volume()==pytest.approx(part['solid'].volume(),abs=.001)

def test_invalid_shape_options_fail_early():
    for values in [dict(artwork_shape='invalid'),dict(artwork_letter='AB'),dict(artwork_shape='circle'),dict(artwork_rotation=360)]:
        with pytest.raises(ValueError): Settings(**values)

@pytest.mark.parametrize('colour', [False, True])
def test_shaped_print_package_exports_valid_files(tmp_path, colour):
    import zipfile
    import trimesh
    from backend.export import build_project
    s=shaped('letter',artwork_letter='O',printer_width=90,printer_height=90,multicolour=colour)
    build_project(s,tmp_path,lambda *a:None,flat)
    files=list(tmp_path.rglob('*.stl'))
    assert files
    for file in files:
        mesh=trimesh.load(file,force='mesh')
        assert mesh.is_volume and mesh.is_watertight
    archives=list(tmp_path.rglob('*.zip'))
    assert archives
    with zipfile.ZipFile(archives[0]) as archive:
        assert archive.testzip() is None

@pytest.mark.parametrize('shape,rotation,letter',[('square',45,'A'),('rectangle',30,'A'),('circle',0,'A'),('heart',90,'A'),('star',15,'A'),('letter',90,'B'),('letter',0,'O')])
@pytest.mark.parametrize('mode',['integrated','separate'])
@pytest.mark.parametrize('colour',[False,True])
def test_rotated_shaped_borders_are_printable_and_do_not_overlap(shape,rotation,letter,mode,colour):
    from backend.artwork_shapes import artwork_opening
    from backend.geometry import prism
    s=Settings(width=200,height=200,artwork_shape=shape,artwork_rotation=rotation,artwork_letter=letter,
               frame_mode=mode,frame_width=4,frame_contour='flat',inner_bevel=0,outer_bevel=0,
               joints=False,labels=False,resolution=64,roads='none',water=False,buildings=False,
               printer_width=110,printer_height=110,multicolour=colour)
    parts,meta=generate_solids(s,lambda *a:None,flat)
    assert parts
    for part in parts:
        mesh=as_trimesh(part['solid'],ensure_stl=True)
        assert mesh.is_volume and mesh.is_watertight and len(mesh.split())==1
        assert abs(mesh.bounds[0,2])<.001
        assert max(mesh.extents[:2])<=100.001
        if colour:
            assert union(list(part['material_regions'].values())).volume()==pytest.approx(part['solid'].volume(),abs=.001)
    terrain=union([p['solid'] for p in parts if p['kind']=='terrain'])
    if mode=='separate':
        frame=union([p['solid'] for p in parts if p['kind']=='frame'])
        assert (terrain ^ frame).volume()<1e-6
        assert meta['frame_fit']['shaped_border']
        assert frame.volume()>0
    else:
        border=artwork_outline(s).difference(artwork_opening(s))
        assert (terrain ^ prism(border,s.frame_depth+s.frame_height)).volume()>0

def test_square_rotation_matches_diamond_preset():
    square=artwork_outline(shaped('square',artwork_rotation=45))
    diamond=artwork_outline(shaped('diamond'))
    assert square.symmetric_difference(diamond).area<.01

@pytest.mark.parametrize('mode',['integrated','separate'])
def test_rotated_border_package_exports(tmp_path,mode):
    from backend.export import build_project
    s=Settings(width=160,height=160,artwork_shape='letter',artwork_letter='O',artwork_rotation=45,
               frame_mode=mode,frame_width=4,frame_contour='flat',inner_bevel=0,outer_bevel=0,
               joints=False,labels=False,resolution=64,roads='none',water=False,buildings=False,
               printer_width=90,printer_height=90,multicolour=True)
    build_project(s,tmp_path,lambda *a:None,flat)
    assert list(tmp_path.rglob('*.stl'))

@pytest.mark.parametrize('letter',list('ABCDEFGHIJKLMNOPQRSTUVWXYZ'))
@pytest.mark.parametrize('mode',['integrated','separate'])
def test_every_letter_supports_a_border_at_small_natural_size(letter,mode):
    from backend.artwork_shapes import RATIOS
    ratio=RATIOS[letter]
    s=Settings(width=200 if ratio>=1 else round(200*ratio,1),height=round(200/ratio,1) if ratio>=1 else 200,
               artwork_shape='letter',artwork_letter=letter,frame_mode=mode,frame_width=4,
               frame_contour='flat',inner_bevel=0,outer_bevel=0,joints=False,labels=False,
               resolution=64,roads='none',water=False,buildings=False)
    parts,_=generate_solids(s,lambda *a:None,flat)
    assert any(p['kind']=='terrain' for p in parts)
    for part in parts:
        mesh=as_trimesh(part['solid'],ensure_stl=True)
        assert mesh.is_volume and mesh.is_watertight and len(mesh.split())==1
        assert abs(mesh.bounds[0,2])<.001
