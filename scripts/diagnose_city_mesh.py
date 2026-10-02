"""Save exact city geometry once, for repeatable mesh analysis without exports.

Run from the repository root: .venv/bin/python -m scripts.diagnose_city_mesh
Only complete provider caches are used by the normal geography pipeline.
"""
import hashlib
import json
from pathlib import Path
import time

import numpy as np
import trimesh

from backend.config import Settings
from backend import geometry

ROOT=Path(__file__).resolve().parents[1]


def mesh_report(mesh):
    edges,counts=np.unique(mesh.edges_sorted,axis=0,return_counts=True)
    bad=edges[counts!=2]
    locations=mesh.vertices[bad.ravel()] if len(bad) else np.empty((0,3))
    return {'vertices':len(mesh.vertices),'faces':len(mesh.faces),
            'watertight':bool(mesh.is_watertight),'winding':bool(mesh.is_winding_consistent),
            'volume_valid':bool(mesh.is_volume),'volume':float(mesh.volume),
            'bad_edges':len(bad),'boundary_edges':int(np.sum(counts==1)),
            'nonmanifold_edges':int(np.sum(counts>2)),
            'degenerate_faces':int(np.sum(mesh.area_faces<1e-12)),
            'bad_edge_bounds':np.array([locations.min(axis=0),locations.max(axis=0)]).tolist() if len(locations) else None}


def save_mesh(path, raw):
    arrays={'vertices':np.asarray(raw.vert_properties)[:,:3], 'faces':np.asarray(raw.tri_verts)}
    for name in ('merge_from_vert','merge_to_vert'):
        if hasattr(raw,name): arrays[name]=np.asarray(getattr(raw,name))
    np.savez_compressed(path,**arrays)
    return arrays


def main():
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--settings',default='data/city-qa-settings.json')
    parser.add_argument('--output',default='data/city-mesh-diagnostics')
    args=parser.parse_args()
    output=ROOT/args.output
    output.mkdir(parents=True,exist_ok=True)
    settings=Settings.model_validate_json((ROOT/args.settings).read_text())
    (output/'settings.json').write_text(settings.model_dump_json(indent=2))
    source={name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest()
            for name in ('backend/geometry.py','backend/geodata.py','backend/buildings.py','backend/export.py')}
    start=time.monotonic()
    parts,meta=geometry.generate_solids(settings,lambda *a:print(*a,flush=True))
    report={'source_sha256':source,'model':meta,'parts':[]}
    for part in parts:
        solid=part['solid']
        print('Saving',part['id'],solid.num_tri(),'faces',flush=True)
        raw=save_mesh(output/(part['id']+'-raw.npz'),solid.to_mesh64())
        simplified=save_mesh(output/(part['id']+'-simplified.npz'),solid.as_original().simplify(.0001).to_mesh64())
        original_mesh=trimesh.Trimesh(vertices=raw['vertices'],faces=raw['faces'],process=False)
        processed=trimesh.Trimesh(vertices=simplified['vertices'],faces=simplified['faces'],process=True)
        production=geometry.as_trimesh(solid)
        record={'id':part['id'],'solid_status':str(solid.status()),'solid_volume':float(solid.volume()),
                'bounds':list(solid.bounding_box()),'cut_bounds':part.get('cut_bounds'),
                'raw':mesh_report(original_mesh),'processed':mesh_report(processed),'production':mesh_report(production)}
        production.export(output/(part['id']+'-production.ply'))
        report['parts'].append(record)
        report['elapsed_seconds']=time.monotonic()-start
        (output/'report.json').write_text(json.dumps(report,indent=2))
        print(part['id'],record['production'],flush=True)


if __name__=='__main__': main()
