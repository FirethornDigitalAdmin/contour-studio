"""Keep packaged resources separate from user-owned projects and caches."""
import os
import sys
from pathlib import Path


def configure_packaged_tls():
    """Give frozen urllib/OpenSSL clients a portable, verified CA store.

    Python's build-machine certificate path does not exist on user computers.
    Preserve an explicitly configured trust store and pass the bundled store
    through the environment so nested modelling helpers inherit it too.
    """
    if getattr(sys, 'frozen', False):
        import certifi
        os.environ.setdefault('SSL_CERT_FILE', certifi.where())


configure_packaged_tls()

RESOURCE_ROOT = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parents[1]))


def user_data_root():
    override = os.environ.get('CONTOUR_DATA_DIR')
    if override:
        return Path(override).expanduser().resolve()
    if not getattr(sys, 'frozen', False) and not os.environ.get('CONTOUR_DESKTOP'):
        return RESOURCE_ROOT / 'data'
    if sys.platform == 'darwin':
        return Path.home() / 'Library' / 'Application Support' / 'Contour Studio'
    if sys.platform == 'win32':
        return Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData' / 'Local')) / 'Contour Studio'
    return Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local' / 'share')) / 'contour-studio'


DATA_ROOT = user_data_root()


def worker_command(module, *args):
    if getattr(sys, 'frozen', False):
        suffix = '.exe' if sys.platform == 'win32' else ''
        engine = Path(sys.executable).parent / ('ContourEngine' + suffix)
        if not engine.is_file():
            engine = RESOURCE_ROOT / ('ContourEngine' + suffix)
        return [str(engine), module, *args]
    return [sys.executable, '-m', module, *args]


def subprocess_options():
    # Keep the helper's pipes while avoiding console windows on Windows.
    return {'creationflags': 0x08000000} if sys.platform == 'win32' else {}
