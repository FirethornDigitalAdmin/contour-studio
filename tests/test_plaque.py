import numpy as np
import pytest
from pydantic import ValidationError
from shapely.geometry import box

from backend.config import Settings
from backend.export import build_project
from backend.geometry import generate_solids, as_trimesh, prism
from backend.plaque import plaque_parts, plaque_layout, caption_text, outline, BASE, RELIEF

B=dict(west=-1.352, east=-1.278, south=53.498586, north=53.527414)
def hills(xs,ys,geo): return np.add.outer(np.sin(ys/70)*15,np.cos(xs/80)*20),[]
def quiet(*args): pass


@pytest.mark.parametrize('shape',['rounded','rectangle','oval','ticket'])
@pytest.mark.parametrize('style',['raised','engraved'])
@pytest.mark.parametrize('font',['sans','serif'])
def test_plaque_is_one_printable_plate_with_text_inside_it(shape,style,font):
    s=Settings(bounds=B,plaque=True,plaque_title='Bolton upon Dearne',plaque_subtitle='Where we grew up',plaque_shape=shape,plaque_style=style,plaque_font=font,plaque_width=120,multicolour=True)
    letters,width,height,smallest=plaque_layout(s)
    assert outline(shape,width,height).buffer(-1.5).covers(letters)
    assert smallest>1.6 and 18<height<70
    (part,),notes=plaque_parts(s)
    mesh=as_trimesh(part['solid'],ensure_stl=True)
    assert mesh.is_watertight and len(mesh.split())==1
    assert mesh.bounds[0,2]==pytest.approx(0) and mesh.bounds[1,2]==pytest.approx(BASE+(RELIEF if style=='raised' else 0))
    assert sum(r.volume() for r in part['material_regions'].values())==pytest.approx(part['solid'].volume(),rel=1e-9)
    assert ('markers' in part['material_regions'])==(style=='raised')
    # It sits clear below the artwork in the assembled preview.
    assert mesh.bounds[1,1]<-5


def test_plaque_defaults_to_place_name_and_coordinates(tmp_path):
    s=Settings(name='Keswick',resolution=64,buildings=False,plaque=True,frame_mode='none',joints=False,labels=False)
    one=plaque_layout(s)[0]
    assert not one.equals(plaque_layout(s.model_copy(update=dict(plaque_coordinates=False)))[0])
    info=build_project(s,tmp_path,quiet,hills)
    plaque=next(p for p in info['parts'] if p['id']=='Plaque')
    assert plaque['watertight'] and plaque['components']==1 and plaque['dimensions_mm'][0]==pytest.approx(90,abs=.01)
    assert any('Plaque:' in w for w in info['model']['warnings'])
    assert not plaque_parts(Settings())[0]
    with pytest.raises(ValidationError): Settings(plaque_width=20)
    with pytest.raises(ValueError,match='build plate'):
        plaque_parts(Settings(plaque=True,plaque_width=240,printer_width=180,printer_height=180))


@pytest.mark.parametrize('frame',['integrated','separate'])
@pytest.mark.parametrize('position',['bottom','top'])
@pytest.mark.parametrize('style',['raised','engraved'])
def test_frame_lettering_position_style_and_custom_text(frame,position,style):
    base=dict(name='Hang',bounds=B,resolution=64,buildings=False,frame_mode=frame,front_caption=True,caption_text='For Mum & Dad · 2026',caption_position=position,caption_style=style,caption_font='serif',caption_size=6)
    s=Settings(**base)
    assert caption_text(s)=='For Mum & Dad · 2026' and 'HANG' in caption_text(s.model_copy(update=dict(caption_text='')))
    parts,_=generate_solids(s,quiet,hills)
    plain,_=generate_solids(s.model_copy(update=dict(front_caption=False)),quiet,hills)
    volume=lambda group:sum(p['solid'].volume() for p in group if p['kind'] in ('terrain','frame'))
    change=volume(parts)-volume(plain)
    assert (change>5) if style=='raised' else (change<-5)
    top=s.frame_depth+s.frame_height
    rail=box(0,0,s.width,s.frame_width) if position=='bottom' else box(0,s.height-s.frame_width,s.width,s.height)
    other=box(0,s.height-s.frame_width,s.width,s.height) if position=='bottom' else box(0,0,s.width,s.frame_width)
    above=lambda group,area:sum((p['solid']^prism(area,2,top+.01)).volume() for p in group if p['kind'] in ('terrain','frame'))
    if style=='raised':
        assert above(parts,rail)>5 and above(parts,other)<1e-6
    for p in parts:
        mesh=as_trimesh(p['solid'],ensure_stl=True)
        assert mesh.is_watertight and len(mesh.split())==1,p['id']


def test_raised_lettering_gets_its_own_colour_on_a_separate_frame(tmp_path):
    s=Settings(name='Colour',bounds=B,resolution=64,buildings=False,frame_mode='separate',front_caption=True,multicolour=True,caption_size=5)
    info=build_project(s,tmp_path,quiet,hills)
    lettered=[t for t in info['multicolour']['tiles'] if t['part_id'].startswith('Frame_') and any(m['id']=='markers' for m in t['materials'])]
    assert lettered
    assert all(p['watertight'] for p in info['parts'])


def test_contoured_frames_take_lettering_on_either_rail():
    for position in ('bottom','top'):
        s=Settings(name='Follow',bounds=B,resolution=64,buildings=False,frame_mode='integrated',frame_contour='follow',front_caption=True,caption_position=position)
        parts,_=generate_solids(s,quiet,hills)
        assert all(as_trimesh(p['solid'],ensure_stl=True).is_watertight for p in parts)


def test_small_lettering_is_reported_not_hidden():
    s=Settings(plaque=True,plaque_title='Bolton upon Dearne',plaque_subtitle='Where we grew up',plaque_shape='oval',plaque_width=60)
    _,notes=plaque_parts(s)
    assert any('smallest plaque lettering' in note for note in notes)
