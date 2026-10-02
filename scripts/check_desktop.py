"""Check the frozen engine, real STL export and worker error IPC without network."""
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
                                capture_output=True, text=True, env=env, timeout=120)
        if result.returncode:
            raise SystemExit(result.stderr + result.stdout)
        report = json.loads(result.stdout.strip().splitlines()[-1])
        assert report['status'] == 'ok'
        result = subprocess.run([str(engine), 'backend.worker', str(Path(tmp) / 'invalid')],
                                input='{} invalid', capture_output=True, text=True, env=env, timeout=30)
        assert result.returncode == 1
        assert json.loads(result.stdout.strip().splitlines()[-1])['type'] == 'error'
        print('PASS: frozen geometry engine exports a watertight STL/ZIP and preserves worker error IPC.')

if __name__ == '__main__':
    main()
