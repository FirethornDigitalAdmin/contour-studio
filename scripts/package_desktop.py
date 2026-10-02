"""Create a drag-to-Applications Mac installer from the native app bundle."""
import platform
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def main():
    if platform.system() != 'Darwin':
        raise SystemExit('Build the Windows installer with desktop/windows.iss on Windows.')
    app = Path(os.environ.get('CONTOUR_DESKTOP_DIR', ROOT / 'desktop-dist')) / 'Contour Studio.app'
    if not app.exists():
        raise SystemExit('Build the desktop app first; see DESKTOP.md.')
    releases = ROOT / 'releases'
    releases.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as folder:
        stage = Path(folder)
        shutil.copytree(app, stage / app.name, symlinks=True)
        (stage / 'Applications').symlink_to('/Applications')
        (stage / 'READ ME.txt').write_text('Drag Contour Studio to Applications, then open it.\n'
            'Projects are stored separately in Application Support/Contour Studio.\n'
            'This community build is not notarised; macOS may require Open Anyway in Privacy & Security.\n')
        target = releases / f'Contour-Studio-macOS-{platform.machine()}.dmg'
        subprocess.run(['hdiutil', 'create', '-volname', 'Contour Studio', '-srcfolder', str(stage),
                        '-ov', '-format', 'UDZO', str(target)], check=True)
        print(target)

if __name__ == '__main__':
    main()
