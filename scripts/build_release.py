"""Build clean local-use and GitHub source ZIPs, excluding personal data."""
import os
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
FILES = ['pytest.ini', 'README.md', 'UI-REVIEW.md', 'VERIFICATION.md', 'START-HERE.md', 'DESKTOP.md', 'HOSTING.md', 'CHANGES-2026-10-05.md', 'LAND-HEIGHT-AND-FRAME.md', 'LANDSCAPE-CUSTOMISATION.md', 'TRANSPORT-AND-CITY-DETAIL.md', 'SEO.md', 'LICENSE', '.gitignore', 'start.py', 'start.command',
         'start.sh', 'start.bat', 'requirements.txt', 'requirements-desktop.txt', 'requirements.lock.txt', 'package.json',
         'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'vite.config.ts', 'index.html']
DIRECTORIES = ['backend', 'src', 'public', 'tests', 'desktop', 'scripts', '.github']
EXCLUDED_PARTS = {'__pycache__', '.pytest_cache', 'node_modules', 'data', 'releases', 'dist',
                  'dist-hosted', 'desktop-dist', 'build-desktop', '.desktop-tools', '.DS_Store'}
EXCLUDED_SUFFIXES = {'.pyc', '.pyo', '.log', '.tsbuildinfo'}


def releasable(path: Path) -> bool:
    relative = path.relative_to(ROOT)
    return (path.is_file() and not path.is_symlink()
            and not any(part in EXCLUDED_PARTS for part in relative.parts)
            and not any(part.startswith('.env') for part in relative.parts)
            and path.suffix not in EXCLUDED_SUFFIXES)


def frontend_notices() -> str:
    modules = ROOT / 'node_modules'
    notices = ['Third-party notices for installed frontend/build dependencies.\n'
               'These packages retain their own licenses. Not every build dependency is included in the browser bundle.\n']
    for path in sorted(modules.rglob('*')):
        if path.is_file() and path.name.lower().startswith(('license', 'licence', 'copyright', 'notice')):
            notices.append(f'\n--- {path.relative_to(modules)} ---\n{path.read_text(errors="replace")}')
    if len(notices) == 1:
        raise SystemExit('Install frontend dependencies before packaging so their license notices can be included.')
    return '\n'.join(notices)


def build() -> None:
    frontend = Path(os.environ.get('CONTOUR_UI_DIR', ROOT / 'dist')).resolve()
    if not (frontend / 'index.html').is_file():
        raise SystemExit('Build the interface first: pnpm install --frozen-lockfile && pnpm build')
    output = ROOT / 'releases'
    output.mkdir(exist_ok=True)
    notices = frontend_notices()
    source = [ROOT / name for name in FILES]
    for directory in DIRECTORIES:
        source.extend(p for p in (ROOT / directory).rglob('*') if releasable(p))
    missing = [str(path.relative_to(ROOT)) for path in source if not path.is_file()]
    if missing:
        raise SystemExit('Release source is incomplete: ' + ', '.join(missing))
    for kind in ['source', 'local']:
        files = source + (list(p for p in frontend.rglob('*') if p.is_file()) if kind == 'local' else [])
        target = output / f'Contour-Studio-{kind}.zip'
        with ZipFile(target, 'w', compression=ZIP_DEFLATED) as archive:
            for path in sorted(files):
                relative = Path('dist') / path.relative_to(frontend) if path.is_relative_to(frontend) else path.relative_to(ROOT)
                archive.write(path, Path('Contour-Studio') / relative)
            if kind == 'local':
                archive.writestr('Contour-Studio/THIRD-PARTY-NOTICES.txt', notices)
        print(f'{target.name}: {target.stat().st_size / 1024 / 1024:.1f} MB')


if __name__ == '__main__':
    build()
