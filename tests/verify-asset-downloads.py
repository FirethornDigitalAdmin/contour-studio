"""Validate actual downloads from browser-assets.cjs (run that test first)."""
from pathlib import Path
import json
import trimesh

root = Path(__file__).resolve().parents[1] / 'data' / 'assets-review'
results = []
for kind in ('key', 'bridge', 'mount', 'square', 'hex', 'plaque'):
    path = root / f'browser-contour-{kind}-100mm.stl'
    if kind == 'key': path = root / 'browser-contour-key-10mm.stl'
    if kind == 'bridge': path = root / 'browser-contour-bridge-50mm.stl'
    if kind == 'mount': path = root / 'browser-contour-mount-40mm.stl'
    mesh = trimesh.load(path, force='mesh')
    assert mesh.is_watertight, path.name
    assert mesh.is_winding_consistent, path.name
    assert mesh.volume > 0, path.name
    assert len(mesh.split()) == 1, f'{path.name} contains disconnected pieces'
    results.append(dict(asset=kind, watertight=True, consistent_winding=True,
                        volume_mm3=float(mesh.volume), dimensions_mm=mesh.extents.tolist()))
(root / 'mesh-validation.json').write_text(json.dumps(results, indent=2))
print('PASS: all six actual browser downloads are single, closed solids with consistent winding and positive volume.')
