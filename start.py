"""Set up and launch the local web app using a normal Python installation."""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parent


def run(command: list[str]) -> None:
    subprocess.run(command, cwd=ROOT, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Set up and check the app without opening it.')
    args = parser.parse_args()
    if sys.version_info < (3, 12):
        raise RuntimeError('Install Python 3.12 or newer from https://www.python.org/downloads/ and try again.')

    environment = ROOT / '.venv'
    python = environment / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    if not python.is_file():
        print('First run: preparing Python for Contour Studio…', flush=True)
        venv.EnvBuilder(with_pip=True).create(environment)

    requirements = ROOT / 'requirements.txt'
    fingerprint = hashlib.sha256(requirements.read_bytes()).hexdigest()
    stamp = environment / '.contour-requirements'
    installed = stamp.read_text().strip() if stamp.exists() else ''
    probe = subprocess.run([str(python), '-c', 'import backend.app'], cwd=ROOT, capture_output=True)
    if installed != fingerprint or probe.returncode:
        print('Installing app dependencies. The first run needs internet and can take a few minutes…', flush=True)
        run([str(python), '-m', 'pip', 'install', '-r', str(requirements)])
        run([str(python), '-c', 'import backend.app'])
        stamp.write_text(fingerprint)

    if not (ROOT / 'dist' / 'index.html').is_file():
        print('Building the browser interface…', flush=True)
        pnpm, npm = shutil.which('pnpm'), shutil.which('npm')
        if pnpm:
            run([pnpm, 'install', '--frozen-lockfile'])
            run([pnpm, 'build'])
        elif npm:
            run([npm, 'install', '--no-audit', '--no-fund'])
            run([npm, 'run', 'build'])
        else:
            raise RuntimeError('This is a source download. Use the Contour-Studio-local.zip release (interface included), '
                               'or install Node.js 22.12+ and run this launcher again.')

    if args.check:
        print('Contour Studio is ready. Run the launcher again without --check to open it.')
    else:
        run([str(python), '-m', 'backend.launch'])


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
    except (RuntimeError, OSError, subprocess.CalledProcessError) as exc:
        print(f'\nContour Studio could not start: {exc}\nSee START-HERE.md for setup help.', file=sys.stderr)
        raise SystemExit(1)
