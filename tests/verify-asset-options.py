"""Verify the actual files downloaded by browser-asset-options.cjs."""
from pathlib import Path
import io, zipfile, json
import xml.etree.ElementTree as ET
import numpy as np
import trimesh
from backend.config import Settings
from backend.formats import cells, modular_holders
from backend.geometry import as_trimesh

root=Path(__file__).resolve().parents[1]/'data'/'assets-review'
ns={'m':'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'}
for kind,label,format in [('hex','hexagonal','hexagons'),('square','square','mini_tiles')]:
 for width in (80,100,140):
  with zipfile.ZipFile(root/f'{label}-{width}-download.zip') as z:
   assert z.testzip() is None
   assert {'Blank.stl','Base.stl','Key.stl','Base.scad','Blank.scad','Readme.txt'}<=set(z.namelist())
   meshes={name:trimesh.load(io.BytesIO(z.read(f'{name}.stl')),file_type='stl',force='mesh') for name in ('Blank','Base','Key')}
   for mesh in meshes.values():assert mesh.is_watertight and mesh.is_winding_consistent and mesh.volume>0
   s=Settings().model_copy(update=dict(map_format=format,wall_mode='places',wall_positions=[(0,0)],tile_size=width,tile_gap=6,tolerance=.2,frame_height=3,mount_mode='seat'))
   footprints=list(cells(s));x,y=footprints[0][2].centroid.coords[0]
   expected=as_trimesh(modular_holders(footprints,s,4)[0]['solid'].translate([-x,-y,0]))
   assert np.allclose(meshes['Base'].bounds,expected.bounds,atol=.0001)
   assert np.isclose(meshes['Base'].volume,expected.volume,rtol=.00001)
   assert np.isclose(meshes['Blank'].extents[2],4)
   assembled=meshes['Blank'].copy();assembled.apply_translation([0,0,4])
   overlap=trimesh.boolean.intersection([meshes['Base'],assembled],engine='manifold')
   assert overlap.is_empty or abs(overlap.volume)<.001
for shape in ('heritage','rounded','oval','shield','rectangle'):
 for mode in ('engraved','raised'):
  m=trimesh.load(root/f'ui-{shape}-{mode}.stl',force='mesh')
  assert m.is_watertight and m.is_winding_consistent and len(m.split())==1
 for name in [f'ui-{shape}-ams.3mf']:
  with zipfile.ZipFile(root/name) as z:
   assert z.testzip() is None
   model=ET.fromstring(z.read('3D/3dmodel.model'));assert model.get('unit')=='millimeter'
   meshes=[]
   for object in model.findall('m:resources/m:object',ns):
    m=object.find('m:mesh',ns)
    if m is None:continue
    v=[[float(a.get(k)) for k in ('x','y','z')] for a in m.findall('m:vertices/m:vertex',ns)]
    f=[[int(a.get(k)) for k in ('v1','v2','v3')] for a in m.findall('m:triangles/m:triangle',ns)]
    mesh=trimesh.Trimesh(vertices=v,faces=f);assert mesh.is_watertight and mesh.is_winding_consistent;meshes.append(mesh)
   assert len(meshes)==2
   overlap=trimesh.boolean.intersection(meshes,engine='manifold');assert overlap.is_empty or abs(overlap.volume)<.001
   joined=trimesh.boolean.union(meshes,engine='manifold');assert joined.is_watertight and len(joined.split())==1
   config=ET.fromstring(z.read('Metadata/model_settings.config'))
   assert [m.get('value') for m in config.findall('.//part/metadata[@key="extruder"]')]==['1','2']
with zipfile.ZipFile(root/'ui-custom-colours.3mf') as z:
 model=ET.fromstring(z.read('3D/3dmodel.model'))
 assert [b.get('displaycolor') for b in model.findall('m:resources/m:basematerials/m:base',ns)]==['#193E58FF','#F4CF87FF']
(root/'options-validation.json').write_text(json.dumps(dict(tile_kits=6,plaque_stls=10,colour_3mfs=5,watertight=True,holder_geometry_matches=True,colour_volume_overlap=False),indent=2))
print('PASS: production-equivalent bases at all sizes, blank clearance, closed plaque meshes, non-overlapping colour volumes and two filament assignments.')
