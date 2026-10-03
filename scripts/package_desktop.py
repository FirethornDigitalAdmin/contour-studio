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
                        '-ov', '-fs', 'HFS+', '-format', 'UDRW', str(writable)], check=True)
        try:
            subprocess.run(['hdiutil', 'attach', str(writable), '-mountpoint', str(mount),
                            '-nobrowse'], check=True)
            try:
                from ds_store import DSStore
                from mac_alias import Alias
                # Resolve /var -> /private/var before constructing a volume-relative alias.
                image_alias = Alias.for_file(str((mount / '.background' / 'installer.png').resolve()))
                if image_alias.target.posix_path not in (b'/.background/installer.png', '/.background/installer.png'):
                    raise SystemExit('Installer background reference must stay inside the disk image.')
                image_alias.volume.posix_path = '/Volumes/Contour Studio'
                # Write the layout directly so builds do not depend on Finder's cache.
                with DSStore.open(str(mount / '.DS_Store'), 'w+') as layout:
                    layout['.']['bwsp'] = {
                        'ShowStatusBar': False, 'ShowToolbar': False,
                        'ShowTabView': False, 'ShowSidebar': False,
                        'ContainerShowSidebar': False,
                        'WindowBounds': '{{200, 160}, {640, 380}}',
                    }
                    layout['.']['icvp'] = {
                        'viewOptionsVersion': 1, 'backgroundType': 2,
                        'backgroundColorRed': 1.0, 'backgroundColorGreen': 1.0, 'backgroundColorBlue': 1.0,
                        'scrollPositionX': 0.0, 'scrollPositionY': 0.0,
                        'backgroundImageAlias': image_alias.to_bytes(),
                        'iconSize': 96.0, 'textSize': 12.0,
                        'gridSpacing': 100.0, 'gridOffsetX': 0.0, 'gridOffsetY': 0.0,
                        'arrangeBy': 'none', 'labelOnBottom': True,
                        'showItemInfo': False, 'showIconPreview': True,
                    }
                    # Finder ignores icon-view options without its layout version record.
                    layout['.']['vSrn'] = ('long', 1)
                    layout['.']['icvl'] = ('type', b'icnv')
                    layout['Contour Studio.app']['Iloc'] = (160, 130)
                    layout['Applications']['Iloc'] = (470, 130)

            finally:
                subprocess.run(['hdiutil', 'detach', str(mount)], check=True)
            subprocess.run(['hdiutil', 'convert', str(writable), '-ov', '-format', 'UDZO',
                            '-o', str(target)], check=True)
        finally:
            writable.unlink(missing_ok=True)
        print(target)

if __name__ == '__main__':
    main()
