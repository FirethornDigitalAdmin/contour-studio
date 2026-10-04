"""Relief controls must change real printable solids, including all exports."""
import numpy as np
import pytest
import trimesh
from backend.config import Settings
from backend.geodata import Geography
from backend.geometry import generate_solids, as_trimesh, union, frame_solid, frame_profile
from backend.export import build_project


def quiet(*args): pass

def settings(**changes):
    defaults=dict(width=120,height=100,resolution=64,smoothing=0,water=False,
                  roads='none',buildings=False,landmarks=False,labels=False,joints=False,
                  frame_mode='separate',inner_bevel=1,outer_bevel=.8)
    return Settings(**(defaults|changes))

def slope(xs,ys,geo):
    # Final height variation is exactly 25 mm before flattening.
    return np.tile((xs-xs[0])/(xs[-1]-xs[0])*25/(geo.scale*geo.settings.exaggeration),(len(ys),1)),[]

@pytest.mark.parametrize('variation',[0,0.5,0.75,1])
def test_land_variation_changes_exported_surface(variation):
    s=settings(land_variation=variation,frame_mode='none')
    parts,meta=generate_solids(s,quiet,slope)
    assert meta['land_height_mm']==pytest.approx([s.base,s.base+25*variation])
    mesh=as_trimesh(parts[0]['solid'])
    assert mesh.is_volume and mesh.is_watertight
    assert mesh.bounds[1,2]==pytest.approx(s.base+25*variation,abs=1e-4)

@pytest.mark.parametrize('mode',['integrated','separate'])
@pytest.mark.parametrize('contour',['minimum','follow'])
@pytest.mark.parametrize('style',['smooth','terraced','sculpted','faceted'])
def test_contours_are_printable_with_caption_and_bevels(mode,contour,style):
    s=settings(frame_mode=mode,frame_contour=contour,terrain_style=style,front_caption=True)
    parts,meta=generate_solids(s,quiet,slope)
    lo,hi=meta['frame_height_mm']
    assert hi>lo+5
    assert lo>=s.frame_depth+s.frame_height if contour=='minimum' else lo<s.frame_depth+s.frame_height
    for p in parts:
        m=as_trimesh(p['solid'])
        assert m.is_volume and m.is_watertight,p['id']
        assert len(m.split())==1,p['id']
        assert m.bounds[0,2]==pytest.approx(0,abs=1e-5)

@pytest.mark.parametrize('radius',[0,2,10])
def test_tiling_preserves_contoured_geometry(radius):
    s=settings(width=240,height=160,printer_width=140,printer_height=180,corner_radius=radius,
               frame_contour='follow',joints=False)
    parts,meta=generate_solids(s,quiet,slope)
    rebuilt=union([p['solid'] for p in parts])
    assert rebuilt.volume()==pytest.approx(meta['whole_volume_mm3'],abs=.01)
    assert meta['frame_fit']['seat_angle_degrees']==45


def test_contoured_export_keeps_settings_and_watertight_meshes(tmp_path):
    s=settings(frame_contour='minimum',land_variation=.5,multicolour=True)
    info=build_project(s,tmp_path,quiet,slope)
    assert info['settings']['land_variation']==.5
    assert info['settings']['frame_contour']=='minimum'
    for part in info['parts']:
        mesh=trimesh.load_mesh(tmp_path/part['file'])
        assert mesh.is_watertight and mesh.is_volume


def test_old_settings_and_invalid_values():
    old=Settings().model_dump(exclude={'land_variation','frame_contour','frame_clearance'})
    restored=Settings(**old)
    assert restored.land_variation==1 and restored.frame_contour=='flat'
    for update in [dict(land_variation=-.1),dict(land_variation=1.1),dict(frame_contour='bad'),dict(frame_clearance=0)]:
        with pytest.raises(ValueError): settings(**update)


def test_frame_printer_height_checked_after_contouring():
    with pytest.raises(ValueError,match='frame exceeds'):
        generate_solids(settings(frame_contour='follow',printer_z=30,frame_clearance=5),quiet,slope)
