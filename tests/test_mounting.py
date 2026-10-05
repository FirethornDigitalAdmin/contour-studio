import numpy as np
import pytest
from pydantic import ValidationError
from shapely.geometry import Point, box

from backend import mounting
from backend.config import Settings
from backend.export import build_project
from backend.formats import cells
from backend.geometry import generate_solids, prism, as_trimesh
from tests.test_formats import design, fixture, quiet


@pytest.mark.parametrize('shape',['mini_tiles','hexagons'])
@pytest.mark.parametrize('hang',['pucks','magnet_pucks'])
@pytest.mark.parametrize('mount',['seat','magnets'])
def test_wall_pucks_fit_sockets_and_leave_a_roof(tmp_path,shape,hang,mount):
    s=design(shape,wall_mode='places',wall_positions=[(0,0),(0,1),(1,0)],collection_columns=2,collection_rows=2,mount_mode=mount,hang_mode=hang,tile_size=80)
    info=build_project(s,tmp_path,quiet,fixture)
    ids={p['id']:p for p in info['parts']}
    assert ids['Wall_puck']['quantity']==3 and {'Puck_spacing_jig','Puck_Socket_Fit'}<=ids.keys()
    assert all(p['watertight'] and p['components']==1 and p['flat_base'] for p in info['parts'])
    assert info['model']['mounting']['pitch_mm']==pytest.approx(mounting.puck_pitch(s))
    parts,_=generate_solids(s,quiet,fixture)
    holder=next(p for p in parts if p['kind']=='frame')['solid']
    cx,cy=next(cells(s))[2].centroid.coords[0]
    puck=next(p for p in parts if p['id']=='Wall_puck')['solid']
    # The puck drops fully into its socket and only the push-fit ribs touch the walls.
    seated=puck.translate((cx,cy,0))
    assert seated.bounding_box()[5]<mounting.socket_depth(s)
    grip=(holder^seated).volume()
    assert (0<grip<1) if hang=='pucks' else grip<1e-6
    # Solid material remains between the socket and the insert seat.
    floor=holder.bounding_box()[5]-s.frame_height
    assert (holder^prism(Point(cx,cy).buffer(2),floor-mounting.socket_depth(s)-.1,mounting.socket_depth(s)+.05)).volume()>.5*12.5*(floor-mounting.socket_depth(s)-.1)
    if hang=='magnet_pucks':
        pocket=mounting.puck_magnets(s,cx,cy)[0].centroid
        assert (holder^prism(pocket.buffer(1),s.magnet_depth,mounting.socket_depth(s))).volume()<1e-6
        assert (holder^prism(pocket.buffer(1),.5,floor-.6)).volume()>1


def test_spacing_jig_spans_one_pitch_and_fits_small_beds():
    s=design('mini_tiles',wall_mode='places',wall_positions=[(0,0)],collection_columns=1,collection_rows=1,hang_mode='pucks',tile_size=160,tile_gap=20,printer_width=220,printer_height=220)
    usable=s.printer_width-2*s.margin
    jig=mounting.spacing_jig(s,usable)
    x0,y0,z0,x1,y1,z1=jig.bounding_box()
    assert max(x1-x0,y1-y0)<=usable and len(jig.decompose())==1
    straight=mounting.spacing_jig(s,1000)
    for x in (0,mounting.puck_pitch(s)):
        assert (straight^prism(Point(x,0).buffer(10),2)).volume()<1e-6


@pytest.mark.parametrize('frame',['integrated','separate','none'])
def test_single_map_keyholes_avoid_seams_and_keep_a_roof(frame):
    s=Settings(name='Hang',resolution=64,frame_mode=frame,hang_mode='keyholes',buildings=False)
    parts,meta=generate_solids(s,quiet,lambda xs,ys,geo:(np.add.outer(np.sin(ys/70)*15,np.cos(xs/80)*20),[]))
    spots=meta['mounting']['keyholes_mm']
    assert len(spots)==2 and spots[1][0]-spots[0][0]>200
    cols,rows=s.tile_layout()
    for x,y in spots:
        assert all(abs(x-c*s.width/cols)>9 for c in range(1,cols))
        tile=next(p['solid'] for p in parts if p['kind']=='terrain' and p['cut_bounds'][0]<=x<=p['cut_bounds'][2] and p['cut_bounds'][3]>=y>=p['cut_bounds'][1])
        assert (tile^prism(Point(x,y).buffer(1),1,.1)).volume()<1e-6
        assert (tile^prism(Point(x,y+3).buffer(1),.4,mounting.KEYHOLE_DEPTH+.2)).volume()>.9*.4*3
    for p in parts:
        mesh=as_trimesh(p['solid'],ensure_stl=True)
        assert mesh.is_watertight and len(mesh.split())==1


def test_jigsaw_tray_keyholes_and_limits(tmp_path):
    s=design('jigsaw',hang_mode='keyholes',frame_depth=4.5)
    info=build_project(s,tmp_path,quiet,fixture)
    assert info['model']['mounting']['mode']=='keyholes'
    assert all(p['watertight'] and p['components']==1 for p in info['parts'])
    with pytest.raises(ValidationError,match='tray'):
        design('jigsaw',hang_mode='keyholes',frame_depth=3)
    with pytest.raises(ValidationError,match='pucks'):
        Settings(hang_mode='pucks')
    with pytest.raises(ValidationError,match='base'):
        Settings(hang_mode='keyholes',base=3)


def test_earlier_wall_designs_keep_their_keyhole():
    s=design('mini_tiles',wall_mode='places',wall_positions=[(0,0)],collection_columns=1,collection_rows=1)
    saved=s.model_dump(); saved.pop('hang_mode')
    assert Settings.model_validate(saved).hang_mode=='keyholes'
    assert Settings().hang_mode=='none'
