"""An offline fixture to verify packaged native geometry dependencies."""
import json
import sys
import subprocess
from pathlib import Path
import numpy as np
import trimesh
from backend.config import Settings
from backend.export import build_project

def fixture(xs, ys, geo):
    return np.add.outer(np.sin(ys / 18) * 4, np.cos(xs / 22) * 5), []

folder = Path(sys.argv[1])
settings = Settings(name='Packaged engine check', width=120, height=90, resolution=64,
                    roads='none', buildings=False, water=False, frame_mode='none',
                    joints=False, labels=False)
info = build_project(settings, folder, lambda *_: None, fixture)
for part in info['parts']:
    mesh = trimesh.load_mesh(folder / part['file'])
    assert mesh.is_watertight and mesh.is_volume
assert (folder / 'project.zip').is_file()
from backend.paths import worker_command, subprocess_options
result = subprocess.run(worker_command('backend.worker', str(folder / 'invalid')),
                        input='invalid JSON', capture_output=True, text=True, timeout=120, **subprocess_options())
assert result.returncode == 1 and json.loads(result.stdout.strip().splitlines()[-1])['type'] == 'error'
print(json.dumps({'status': 'ok', 'parts': len(info['parts'])}))
