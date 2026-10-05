import numpy as np
import pytest
import trimesh
from pydantic import ValidationError
from backend.config import Settings, MapTile, Trail
from backend.formats import collection_size, puzzle_shapes, cells
from shapely.geometry import box
from backend.geometry import union, prism, generate_solids, as_trimesh
from backend.export import build_project


def fixture(xs,ys,geo):
    return np.add.outer(np.linspace(0,30,len(ys)),np.linspace(0,15,len(xs))),[]

def quiet(*args):pass

def design(fmt,**updates):
    data=dict(map_format=fmt,resolution=64,buildings=False,water=False,roads='none',joints=False,labels=False,frame_mode='separate',width=180,height=120,printer_width=256,printer_height=256)
    data.update(updates)
    s=Settings().model_copy(update=data)
    if fmt in ('mini_tiles','hexagons'):
        s.width,s.height=collection_size(s)
        s.map_tiles=[MapTile(id=str(i),name=f'Place {i}',bounds=s.bounds.model_copy(update={'west':s.bounds.west+i*.01,'east':s.bounds.east+i*.01})) for i in range(len(s.wall_positions) if s.wall_positions else s.collection_columns*s.collection_rows)]
    return Settings.model_validate(s.model_dump())

@pytest.mark.parametrize('fmt',['mini_tiles','hexagons','jigsaw'])
@pytest.mark.parametrize('multicolour',[False,True])
def test_printable_format_pack(tmp_path,fmt,multicolour):
    s=design(fmt,multicolour=multicolour,mount_mode='magnets')
    info=build_project(s,tmp_path,quiet,fixture)
    terrain=[p for p in info['parts'] if p['kind']=='terrain']
    assert len(terrain)==(s.puzzle_columns*s.puzzle_rows if fmt=='jigsaw' else 4)
    assert all(p['watertight'] and p['components']==1 and p['flat_base'] for p in info['parts'])
    assert all(max(p['dimensions_mm'][:2])<=236.01 for p in info['parts'])
    assert (tmp_path/'project.zip').is_file()
    assert any(p['kind']=='coupon' for p in info['parts'])
    if fmt!='jigsaw':assert len(info['model']['map_sources'])==4
    if multicolour:assert info['multicolour']['enabled']


def test_puzzle_boundaries_partition():
    from shapely.ops import unary_union
    shapes=puzzle_shapes(180,120,3,2,0)
    union=unary_union([p for _,_,p in shapes])
    assert union.area==pytest.approx(180*120)
    for i,(_,_,a) in enumerate(shapes):
        for _,_,b in shapes[i+1:]:assert a.intersection(b).area<1e-7
    assert len(shapes)==6
    assert all(p.is_valid and p.geom_type=='Polygon' for _,_,p in shapes)


def test_magnets_leave_roof_and_tray_floor():
    s=design('hexagons',mount_mode='magnets')
    parts,_=generate_solids(s,quiet,lambda xs,ys,geo:(np.zeros((len(ys),len(xs))),[]))
    tile=next(p for p in parts if p['kind']=='terrain')['solid']
    holder=next(p for p in parts if p['kind']=='frame')['solid']
    from backend.geometry import prism
    from shapely.geometry import Point
    from backend.formats import magnet_centres
    shape=next(cells(s))[2];x,y=magnet_centres(shape)[0]
    assert (tile^prism(Point(x,y).buffer(1),1,.1)).volume()<1e-6
    assert (tile^prism(Point(x,y).buffer(1),.5,3)).volume()>1
    assert (holder^prism(Point(x,y).buffer(1),.5,.2)).volume()>1


def test_routes_modify_surface_and_keep_volume():
    s=design('artwork',frame_mode='none',width=120,height=90)
    points=[(s.bounds.west+.01,s.bounds.south+.003),(s.bounds.east-.01,s.bounds.north-.003)]
    baseline,_=generate_solids(s,quiet,fixture);v=baseline[0]['solid'].volume()
    for style in ('raised','engraved'):
        t=Trail(id=style,name='Walk',points=points,style=style)
        parts,meta=generate_solids(s.model_copy(update={'trails':[t]}),quiet,fixture)
        mesh=as_trimesh(parts[0]['solid'],ensure_stl=True)
        assert mesh.is_watertight and mesh.is_volume
        comparison=v if style=='raised' else generate_solids(s.model_copy(update={'base':s.base+t.height}),quiet,fixture)[0][0]['solid'].volume()
        assert (mesh.volume>comparison) if style=='raised' else (mesh.volume<comparison)
        assert meta['features']['trails']==1


def test_unsafe_pocket_rejected():
    with pytest.raises(ValidationError,match='magnet pocket'):
        design('mini_tiles',magnet_depth=4,mount_mode='magnets',base=3)


def test_mapped_route_endpoint_coordinates(monkeypatch):
    from backend.app import mapped_trails
    from backend.geodata import Geography
    from shapely.geometry import LineString
    def vectors(geo,progress):
        points=[geo.point(geo.settings.bounds.west+.001,geo.settings.bounds.south+.001),geo.point(geo.settings.bounds.east-.001,geo.settings.bounds.north-.001)]
        return [('road',LineString(points),{'highway':'path','name':'Test walk','_osm_id':'way/1'})],{'provider':'TEST fixture'}
    monkeypatch.setattr(Geography,'vectors',vectors)
    s=Settings()
    result=mapped_trails(s)
    assert len(result['paths'])==1
    assert result['paths'][0]['points'][0]==pytest.approx([s.bounds.west+.001,s.bounds.south+.001])
    assert result['paths'][0]['name']=='Test walk'


def test_custom_buildings_belong_to_tile():
    from backend.config import CustomBuilding
    s=design('mini_tiles',collection_columns=2,collection_rows=1,buildings=True)
    b=s.map_tiles[0].bounds
    outline=[(b.west+.01,b.south+.004),(b.west+.015,b.south+.004),(b.west+.015,b.south+.006),(b.west+.01,b.south+.006)]
    s.map_tiles[0].custom_buildings=[CustomBuilding(id='home',label='Our home',height=8,points=outline)]
    _,meta=generate_solids(s,quiet,fixture)
    assert meta['features']['buildings']==1


@pytest.mark.parametrize('multicolour',[False,True])
def test_jigsaw_shallow_even_with_extreme_relief(multicolour):
    s=design('jigsaw',base=20,exaggeration=30,multicolour=multicolour)
    parts,meta=generate_solids(s,quiet,fixture)
    for part in parts:
        if part['kind']!='terrain':continue
        mesh=as_trimesh(part['solid'])
        assert mesh.bounds[0,2]==pytest.approx(0,abs=1e-5)
        # Land relief is scaled into its budget above the 3 mm base, however steep the source.
        assert mesh.bounds[1,2]<=3+s.puzzle_relief+1e-5
        assert mesh.is_watertight and mesh.is_volume
        if multicolour:
            assert sum(v.volume() for v in part['material_regions'].values())==pytest.approx(part['solid'].volume(),rel=1e-5)
    assert meta['puzzle_thickness_mm']==pytest.approx(3.6,abs=.01)

@pytest.mark.parametrize('columns,rows',[(2,1),(4,4),(10,10),(2,8)])
@pytest.mark.parametrize('seed',[1,2,9999])
def test_classic_puzzle_partition_and_clearance(columns,rows,seed):
    from shapely.ops import unary_union
    width,height=columns*40,rows*50
    shapes=puzzle_shapes(width,height,columns,rows,0,style='classic',seed=seed)
    union=unary_union([p for _,_,p in shapes])
    assert union.area==pytest.approx(width*height)
    assert sum(p.area for _,_,p in shapes)==pytest.approx(union.area)
    assert all(p.is_valid and p.geom_type=='Polygon' for _,_,p in shapes)
    loose=puzzle_shapes(width,height,columns,rows,.6,style='classic',seed=seed)
    assert all(p.is_valid and p.geom_type=='Polygon' for _,_,p in loose)
    assert sum(p.area for _,_,p in loose)<union.area
    assert shapes[0][2].equals(puzzle_shapes(width,height,columns,rows,0,style='classic',seed=seed)[0][2])
    assert not shapes[0][2].equals(puzzle_shapes(width,height,columns,rows,0,style='classic',seed=seed%9999+1)[0][2])

@pytest.mark.parametrize('multicolour',[False,True])
def test_classic_export_has_matching_fit_pieces(tmp_path,multicolour):
    s=design('jigsaw',puzzle_style='classic',puzzle_seed=37,multicolour=multicolour)
    info=build_project(s,tmp_path,quiet,fixture)
    assert all(p['watertight'] and p['components']==1 and p['flat_base'] for p in info['parts'])
    assert info['model']['puzzle_pattern']=={'style':'classic','seed':37}
    parts,_=generate_solids(s,quiet,fixture)
    shapes=puzzle_shapes(s.width-2*s.frame_width,s.height-2*s.frame_width,s.puzzle_columns,s.puzzle_rows,s.puzzle_clearance,style='classic',seed=37)
    for index in range(2):
        coupon=next(p for p in parts if p['id']==f'Puzzle_Fit_{index+1}')['solid']
        # Eased first layers remove a sliver around the foot; everything above is the exact seam.
        full=shapes[index][2].area*3
        assert full-shapes[index][2].length*.25*.3<coupon.volume()<full
        assert (coupon^prism(box(-50,-50,400,400),2,.4)).volume()==pytest.approx(shapes[index][2].area*2,rel=1e-6)

@pytest.mark.parametrize('shape',['mini_tiles','hexagons'])
@pytest.mark.parametrize('mode',['continuous','places'])
def test_ongoing_wall_modules_and_recovery(tmp_path,shape,mode):
    s=design(shape,wall_mode=mode,wall_positions=[(0,0),(0,1)],collection_columns=2,collection_rows=1,mount_mode='magnets',frame_depth=4,hang_mode='keyholes')
    calls=[]
    def data(xs,ys,geo):
        calls.append(geo.settings.bounds)
        return fixture(xs,ys,geo)
    info=build_project(s,tmp_path,quiet,data)
    assert len(calls)==(1 if mode=='continuous' else 2)
    holders=[p for p in info['parts'] if p['kind']=='frame']
    assert len(holders)==2
    assert all(p['watertight'] and p['components']==1 and p['flat_base'] for p in info['parts'])
    assert any(p['id']=='Wall_key_1' for p in info['parts'])
    assert {'Wall_Fit_Left','Wall_Fit_Right','Wall_Fit_Key'}<={p['id'] for p in info['parts']}
    saved=Settings.model_validate_json((tmp_path/'settings.json').read_text())
    assert saved.wall_positions==[(0,0),(0,1)]
    if mode=='continuous':
        assert saved.elevation_reference is not None and saved.wall_scale is not None
    from shapely.geometry import Point
    from backend.geometry import prism
    parts,_=generate_solids(s,quiet,data)
    holder=next(p for p in parts if p['kind']=='frame')['solid']
    shape2=next(cells(s))[2];cx,cy=shape2.centroid.coords[0]
    # The screw-head entry is recessed from the rear; the holder roof stays intact.
    assert (holder^prism(Point(cx,cy+s.tile_size*.12).buffer(1),1,.1)).volume()<1e-6
    assert (holder^prism(Point(cx,cy+s.tile_size*.12).buffer(1),.5,3)).volume()>1


def test_sparse_wall_positions_and_invalid_duplicates():
    s=design('mini_tiles',wall_mode='places',wall_positions=[(0,0),(1,1)],collection_rows=2,collection_columns=2)
    assert len(list(cells(s)))==2
    with pytest.raises(ValidationError,match='unique'):
        design('mini_tiles',wall_mode='places',wall_positions=[(0,0),(0,0)])


@pytest.mark.parametrize('style',['classic','rounded'])
@pytest.mark.parametrize('size',[30,50,80])
def test_puzzle_neighbours_cannot_slide_apart(style,size):
    from shapely import affinity
    shapes={(r,c):p for r,c,p in puzzle_shapes(size*4,size*3,4,3,.4,style=style,seed=11)}
    assert all(p.is_valid and p.geom_type=='Polygon' for p in shapes.values())
    for (a,b,dx,dy) in [((0,0),(0,1),1,0),((1,1),(1,2),1,0),((0,0),(1,0),0,1),((1,2),(2,2),0,1)]:
        # Pulling a piece 1.5 mm straight away from its neighbour must collide with the knob.
        assert shapes[a].intersection(affinity.translate(shapes[b],dx*1.5,dy*1.5)).area>.5,(style,size,a,b)


@pytest.mark.parametrize('seed',[1,7,4242])
def test_classic_corners_wander_but_still_tile_the_rectangle(seed):
    from shapely.ops import unary_union
    shapes=puzzle_shapes(300,200,6,4,0,style='classic',seed=seed)
    assert unary_union([p for _,_,p in shapes]).symmetric_difference(box(0,0,300,200)).area<1e-6
    assert sum(p.area for _,_,p in shapes)==pytest.approx(300*200,rel=1e-9)
    interior=next(p for r,c,p in shapes if (r,c)==(1,1))
    assert not any(abs(x-50)<1e-9 and abs(y-50)<1e-9 for x,y in interior.exterior.coords)


def test_jigsaw_features_print_as_whole_layers(tmp_path):
    from shapely.geometry import LineString
    def city(xs,ys,geo):
        dem=np.add.outer(np.linspace(0,300,len(ys)),np.linspace(0,150,len(xs)))
        return dem,[('road',LineString([(15,15),(150,95)]),{}),('water',LineString([(15,90),(150,20)]),{}),('building',box(60,70,70,80),{'height':'90'})]
    s=design('jigsaw',roads='raised',water=True,buildings=True,puzzle_relief=1.0,labels=True,exaggeration=30)
    parts,meta=generate_solids(s,quiet,city)
    from backend.formats import PUZZLE_ROAD,PUZZLE_WATER,PUZZLE_BUILDING
    whole=union([p['solid'] for p in parts if p['kind']=='terrain'])
    def top(x,y):
        hits=whole.ray_cast((x,y,50),(x,y,-1));return hits[0].position[2]-s.frame_depth*0
    inset=s.frame_width
    assert meta['puzzle_thickness_mm']<=3+s.puzzle_relief+PUZZLE_BUILDING+PUZZLE_ROAD+.01
    assert min(p['solid'].bounding_box()[2] for p in parts)==pytest.approx(0,abs=1e-6)
    # A 90 m tower and 300 m of relief still leave a 0.4 mm road and a 0.6 mm channel.
    centre=LineString([(15,15),(150,95)]).interpolate(.25,normalized=True)
    off=LineString([(15,15),(150,95)]).parallel_offset(4,'left').interpolate(.25,normalized=True)
    river=LineString([(15,90),(150,20)]).interpolate(.2,normalized=True)
    bank=LineString([(15,90),(150,20)]).parallel_offset(5,'left').interpolate(.2,normalized=True)
    assert top(inset+bank.x,inset+bank.y)-top(inset+river.x,inset+river.y)>PUZZLE_WATER*.6
    assert top(inset+centre.x,inset+centre.y)-top(inset+off.x,inset+off.y)>PUZZLE_ROAD*.6
    assert top(inset+65,inset+75)>top(inset+65,inset+84)+PUZZLE_BUILDING*.6
    info=build_project(s,tmp_path,quiet,city)
    assert all(p['watertight'] and p['components']==1 and p['flat_base'] for p in info['parts'])


@pytest.mark.parametrize('style,seed',[('classic',1),('classic',937),('rounded',1)])
def test_editor_preview_draws_the_engine_cut_lines(style,seed):
    """The layout preview is a second implementation; keep it on the printed seams."""
    import json, re, shutil, subprocess
    from pathlib import Path
    from shapely.geometry import Point
    from shapely.ops import unary_union
    node=shutil.which('node')
    if not node: pytest.skip('Node.js is not available')
    settings=dict(frame_mode='separate',frame_width=10,width=260,height=190,puzzle_columns=5,puzzle_rows=4,puzzle_style=style,puzzle_seed=seed)
    paths=json.loads(subprocess.run([node,str(Path(__file__).with_name('puzzle-preview-paths.cjs')),json.dumps(settings)],capture_output=True,text=True,check=True).stdout)
    assert len(paths)==4*4+3*5
    seams=unary_union([p.exterior for _,_,p in puzzle_shapes(240,170,5,4,0,style=style,seed=seed)])
    for d in paths:
        for x,y in re.findall(r'[ML](-?[\d.e-]+),(-?[\d.e-]+)',d):
            assert seams.distance(Point(float(x)-10,float(y)-10))<1e-6
        for r,flag,x,y in re.findall(r'A([\d.e-]+),[\d.e-]+ 0 1 ([01]) (-?[\d.e-]+),(-?[\d.e-]+)',d):
            assert seams.distance(Point(float(x)-10,float(y)-10))<1e-6
    if style=='rounded':
        # The far point of each arc lies on the printed knob, on the side the sweep flag draws.
        d=paths[0]; x0,y0=map(float,re.search(r'L([\d.e-]+),([\d.e-]+) A',d).groups())
        r,flag=re.search(r'A([\d.e-]+),[\d.e-]+ 0 1 ([01])',d).groups(); r=float(r)
        direction=-1 if flag=='0' else 1
        # In the flipped SVG group a sweep of 0 bulges towards +x for this downward-drawn chord.
        centre_x=x0-10+direction*-1*r*.8
        assert min(seams.distance(Point(centre_x+sign*r,y0-10+r*.6)) for sign in (-1,1))<1e-6
