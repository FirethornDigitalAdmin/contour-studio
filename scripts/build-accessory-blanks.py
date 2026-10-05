"""Build repeatable square/hex kits from the same geometry as map tile holders."""
import json, math, zipfile
from pathlib import Path
from shapely import affinity
from backend.config import Settings
from backend.formats import cells, modular_holders
from backend.geometry import prism, key_shape, as_trimesh

root=Path(__file__).resolve().parents[1]/'public'/'accessories'
root.mkdir(parents=True,exist_ok=True)
for kind,format in [('square','mini_tiles'),('hex','hexagons')]:
 for width in (80,100,140):
  s=Settings().model_copy(update=dict(map_format=format,wall_mode='places',wall_positions=[(0,0)],tile_size=width,tile_gap=6,tolerance=.2,base=4,frame_depth=4,frame_height=3,mount_mode='seat',frame_mode='separate'))
  footprints=list(cells(s)); shape=footprints[0][2]
  insert=prism(shape.buffer(-s.tolerance/2,join_style=2),s.base)
  holder=modular_holders(footprints,s,4)[0]['solid']
  # All exported pieces keep their shared XY origin, centred around the tile.
  x,y=shape.centroid.coords[0]
  centre=lambda solid:solid.translate([-x,-y,0])
  prefix=f'{kind}-{width}'
  meshes={'blank':as_trimesh(centre(insert)),'base':as_trimesh(centre(holder)),'key':as_trimesh(prism(key_shape(),1.8))}
  for name,mesh in meshes.items():
   assert mesh.is_watertight and mesh.is_winding_consistent and mesh.volume>0
   mesh.export(root/f'{prefix}-{name}.stl')
  points=list(affinity.translate(shape,-x,-y).exterior.coords)[:-1]
  base_source=f'''// Contour Studio {kind} holder. mm. Same sockets and keyhole as modular map holders.
$fn=48; tile={width}; gap=6; tolerance=.2; seat=4; rim=3;
module tile_shape(){{polygon({json.dumps(points)});}}
module key_shape(){{polygon([[-5,-3],[-2,-3],[-1,-1.8],[1,-1.8],[2,-3],[5,-3],[5,3],[2,3],[1,1.8],[-1,1.8],[-2,3],[-5,3]]);}}
difference(){{
 union(){{linear_extrude(seat) offset(delta=gap/2) tile_shape();translate([0,0,seat]) linear_extrude(rim) difference(){{offset(delta=gap/2) tile_shape();offset(delta=tolerance/2) tile_shape();}}}}
'''
  outer=affinity.translate(shape.buffer(3,join_style=2),-x,-y)
  edges=list(outer.exterior.coords)
  for a,b in zip(edges,edges[1:]):
   sx,sy=(a[0]+b[0])/2,(a[1]+b[1])/2
   angle=math.degrees(math.atan2(sy,sx))
   base_source+=f'translate([{sx},{sy},-.01]) rotate([0,0,{angle}]) linear_extrude(2.1) offset(delta=tolerance) key_shape();\n'
  cy=width*.12
  base_source+=f'''translate([0,{cy},-.01]) cylinder(h=2.8,r=3.5);
translate([0,{cy},1]) linear_extrude(1.8) hull(){{circle(r=3.5);translate([0,7]) circle(r=3.5);}}
translate([0,{cy},-.01]) linear_extrude(1.1) hull(){{circle(r=1.8);translate([0,7]) circle(r=1.8);}}
}}
'''
  blank_source=f'// Contour Studio {kind} blank. mm. Free to print, modify and share.\nlinear_extrude(4) offset(delta=-.1) polygon({json.dumps(points)});\n'
  (root/f'{prefix}-base.scad').write_text(base_source)
  readme=f'''Contour Studio {kind} blank + matching base — {width} mm tile system
Blank: 4 mm thick, 0.2 mm edge clearance. Base: 4 mm seat, 3 mm rim, 6 mm tile gap.
Generated with the same modular_holders function used for expandable map tiles.
Rear joining-key sockets and hanging keyhole are included. Print both rear-down.
Blank.stl and Base.stl share an XY origin; in an assembly the blank sits 4 mm above the base.
Use the same size, gap, tolerance and holder dimensions as your existing modular tiles.
Legacy collections and customised holder/magnet settings may differ. These are lift-out seats.
Keys align neighbouring bases. Secure each base independently; keys do not carry hanging loads.
Fit and load performance need physical testing. Choose your own material and slicer settings.
Free to print, modify and share, including commercially.
'''
  with zipfile.ZipFile(root/f'{prefix}-kit.zip','w',zipfile.ZIP_DEFLATED) as z:
   for name in meshes:z.write(root/f'{prefix}-{name}.stl',f'{name.title()}.stl')
   z.writestr('Base.scad',base_source);z.writestr('Blank.scad',blank_source);z.writestr('Readme.txt',readme)
print('Built six watertight blank/base kits from production holder geometry.')
