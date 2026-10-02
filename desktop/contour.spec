# Build with: python -m PyInstaller desktop/contour.spec
import sys
import os
from pathlib import Path
from PyInstaller.utils.hooks import collect_all

root = Path(SPECPATH).parent
sys.path.insert(0, str(root))
from scripts.build_desktop_notices import write_notices
ui = Path(os.environ.get('CONTOUR_UI_DIR', root / 'dist')).resolve()
assets = [(str(ui), 'dist'), (str(root / 'LICENSE'), '.'), (str(write_notices(root)), '.')]
binaries = []
hidden = ['backend.app', 'backend.export', 'backend.worker', 'backend.buildings', 'uvicorn.logging', 'uvicorn.loops.auto', 'uvicorn.protocols.http.auto', 'uvicorn.protocols.websockets.auto', 'uvicorn.lifespan.on']
for package in ('webview', 'overturemaps', 'pyarrow', 'manifold3d', 'pyproj'):
    data, libs, imports = collect_all(package)
    assets += data
    binaries += libs
    hidden += imports

a = Analysis([str(root / 'desktop' / 'main.py')], pathex=[str(root)], binaries=binaries,
             datas=assets, hiddenimports=hidden, hookspath=[], hooksconfig={'matplotlib': {'backends': ['Agg']}},
             excludes=['pytest', 'tkinter', 'PyQt5', 'PyQt6', 'PySide6', 'IPython', 'notebook'], noarchive=False)
e = Analysis([str(root / 'desktop' / 'engine.py')], pathex=[str(root)], binaries=[],
             datas=[], hiddenimports=['backend.worker', 'backend.buildings', 'backend.export', 'desktop.smoke'], hookspath=[],
             excludes=['pytest', 'tkinter', 'IPython', 'notebook'], noarchive=False)
pyz = PYZ(a.pure)
epyz = PYZ(e.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='Contour Studio', debug=False,
          bootloader_ignore_signals=False, strip=False, upx=False, console=False, icon=str(root / 'desktop' / ('icon.icns' if sys.platform == 'darwin' else 'icon.ico')))
engine = EXE(epyz, e.scripts, [], exclude_binaries=True, name='ContourEngine', debug=False,
             bootloader_ignore_signals=False, strip=False, upx=False, console=True)
coll = COLLECT(exe, engine, a.binaries, e.binaries, a.datas, e.datas, strip=False, upx=False, name='Contour Studio')
if sys.platform == 'darwin':
    app = BUNDLE(coll, name='Contour Studio.app', icon=str(root / 'desktop' / 'icon.icns'), bundle_identifier='studio.contour.desktop',
                 info_plist={'CFBundleShortVersionString': '1.0.0', 'NSHighResolutionCapable': True,
                             'NSAppTransportSecurity': {'NSAllowsLocalNetworking': True}})
