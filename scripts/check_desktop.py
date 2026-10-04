"""Check frozen geometry, worker IPC and a real online building download."""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def main():
    name = 'ContourEngine.exe' if sys.platform == 'win32' else 'ContourEngine'
    if sys.platform == 'darwin':
        engines = list((ROOT / 'desktop-dist' / 'Contour Studio.app').rglob(name))
    else:
        engines = list((ROOT / 'desktop-dist' / 'Contour Studio').rglob(name))
    if not engines:
        raise SystemExit('Build the desktop app first.')
    engine = engines[0].resolve()
    with tempfile.TemporaryDirectory() as tmp:
        env = {**os.environ, 'CONTOUR_DATA_DIR': tmp, 'MPLCONFIGDIR': str(Path(tmp) / 'matplotlib')}
        result = subprocess.run([str(engine), 'desktop.smoke', str(Path(tmp) / 'project')],
                                capture_output=True, text=True, env=env, timeout=300)
        if result.returncode:
            raise SystemExit(result.stderr + result.stdout)
        report = json.loads(result.stdout.strip().splitlines()[-1])
        assert report['status'] == 'ok'
        result = subprocess.run([str(engine), 'backend.worker', str(Path(tmp) / 'invalid')],
                                input='{} invalid', capture_output=True, text=True, env=env, timeout=120)
        assert result.returncode == 1
        assert json.loads(result.stdout.strip().splitlines()[-1])['type'] == 'error'
        print('PASS: frozen geometry engine exports a watertight STL/ZIP and preserves worker error IPC.')
        # Do not inherit the developer machine's CA path: installers must carry
        # their own trust store. This catches failures hidden by offline fixtures.
        env.pop('SSL_CERT_FILE', None)
        env.pop('SSL_CERT_DIR', None)
        buildings = Path(tmp) / 'buildings.json'
        result = subprocess.run([str(engine), 'backend.buildings',
            json.dumps([-0.130, 51.506, -0.128, 51.507]), str(buildings)],
            capture_output=True, text=True, env=env, timeout=240)
        if result.returncode:
            raise SystemExit(result.stderr + result.stdout)
        online = json.loads(buildings.read_text())
        assert online['complete'] and online['count'] > 0
        print(f'PASS: packaged HTTPS/STAC/S3 downloads {online["count"]} live building outlines with certificate verification.')

if __name__ == '__main__':
    main()
