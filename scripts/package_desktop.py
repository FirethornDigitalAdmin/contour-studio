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
        (stage / '.Installation notes.txt').write_text('Drag Contour Studio to Applications, then open it.\n'
            'Projects are stored separately in Application Support/Contour Studio.\n'
            'This community build is not notarised; macOS may require Open Anyway in Privacy & Security.\n')
        background = stage / '.background'
        background.mkdir()
        shutil.copy2(ROOT / 'desktop' / 'installer-background.png', background / 'installer.png')
        target = releases / f'Contour-Studio-macOS-{platform.machine()}.dmg'
        # Save Finder's icon layout in a writable image before compressing it.
        writable = stage.parent / (stage.name + '-layout.dmg')
        mount = stage.parent / (stage.name + '-mount')
        subprocess.run(['hdiutil', 'create', '-volname', 'Contour Studio', '-srcfolder', str(stage),
                        '-ov', '-format', 'UDRW', str(writable)], check=True)
        try:
            subprocess.run(['hdiutil', 'attach', str(writable), '-mountpoint', str(mount),
                            '-nobrowse'], check=True)
            try:
                script = f'''tell application "Finder"
                    set installerFolder to POSIX file "{mount}" as alias
                    open installerFolder
                    set installerWindow to container window of installerFolder
                    set current view of installerWindow to icon view
                    set toolbar visible of installerWindow to false
                    set statusbar visible of installerWindow to false
                    set bounds of installerWindow to {{200, 160, 840, 540}}
                    set viewOptions to icon view options of installerWindow
                    set arrangement of viewOptions to not arranged
                    set icon size of viewOptions to 96
                    set background picture of viewOptions to file ".background:installer.png" of installerFolder
                    set position of item "Contour Studio.app" of installerFolder to {{160, 130}}
                    set position of item "Applications" of installerFolder to {{470, 130}}
                    update installerFolder without registering applications
                    delay 2
                    close installerWindow
                end tell'''
                subprocess.run(['osascript', '-e', script], check=True)
            finally:
                subprocess.run(['hdiutil', 'detach', str(mount)], check=True)
            subprocess.run(['hdiutil', 'convert', str(writable), '-ov', '-format', 'UDZO',
                            '-o', str(target)], check=True)
        finally:
            writable.unlink(missing_ok=True)
        print(target)

if __name__ == '__main__':
    main()
