"""Startup failures must leave a usable explanation and release the local port."""
import sys
import time
from types import SimpleNamespace
from unittest.mock import Mock

from desktop import main as desktop
import ctypes
from threading import Lock


def runtime(monkeypatch, starts=True, busy=False):
    socket = Mock()
    if busy:
        socket.bind.side_effect = OSError('address in use')
    monkeypatch.setattr(desktop.socket, 'socket', lambda: socket)
    monkeypatch.setenv('CONTOUR_DESKTOP_PORT', '18767')
    view = SimpleNamespace(settings={}, create_window=Mock(), start=Mock())
    server = SimpleNamespace(started=False, should_exit=False)

    def run(**kwargs):
        server.started = starts
        while starts and not server.should_exit:
            time.sleep(.001)

    server.run = run
    monkeypatch.setitem(sys.modules, 'webview', view)
    monkeypatch.setitem(sys.modules, 'uvicorn', SimpleNamespace(Config=Mock(), Server=lambda _: server))
    monkeypatch.setitem(sys.modules, 'backend.app', SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()), jobs={}, lock=Lock()))
    monkeypatch.setattr('desktop.menus.studio_menu', lambda window: ['studio-menu'])
    stop_workers = Mock()
    monkeypatch.setitem(sys.modules, 'backend.worker', SimpleNamespace(stop_workers=stop_workers))
    return view, server, socket, stop_workers


def test_native_workspace_keeps_drafts_and_uses_webview2(monkeypatch, tmp_path):
    view, server, socket, stop_workers = runtime(monkeypatch)
    monkeypatch.setattr(sys, 'platform', 'win32')
    monkeypatch.setattr(desktop, 'window_options', lambda: {'width': 1000, 'height': 650, 'min_size': (800, 480), 'maximized': True})
    desktop.run_application(tmp_path)
    assert view.create_window.call_args.args[1] == 'http://127.0.0.1:18767'
    assert view.start.call_args.kwargs == {
        'menu': ['studio-menu'], 'gui': 'edgechromium', 'private_mode': False, 'storage_path': str(tmp_path / 'browser')}
    assert view.settings['ALLOW_DOWNLOADS']
    assert server.should_exit
    stop_workers.assert_called_once()
    socket.close.assert_called_once()


def test_scaled_windows_display_keeps_restored_window_on_screen(monkeypatch):
    monkeypatch.setattr(sys, 'platform', 'win32')
    user32 = SimpleNamespace(GetDpiForSystem=lambda: 192, GetSystemMetrics=lambda i: [1920, 1080][i])
    monkeypatch.setattr(ctypes, 'windll', SimpleNamespace(user32=user32), raising=False)
    options = desktop.window_options()
    assert options['maximized']
    assert options['width'] < 960 and options['height'] < 540
    assert options['min_size'][0] <= options['width']
    assert options['min_size'][1] <= options['height']


def test_engine_start_failure_shows_recovery_and_releases_port(monkeypatch, tmp_path):
    view, server, socket, stop_workers = runtime(monkeypatch, starts=False)
    desktop.run_application(tmp_path)
    html = view.create_window.call_args.kwargs['html']
    assert 'The app could not start.' in html
    assert 'open Contour Studio again' in html
    assert str(tmp_path / 'desktop.log') in html
    assert server.should_exit
    stop_workers.assert_called_once()
    socket.close.assert_called_once()


def test_second_launch_explains_conflict_without_starting_engine(monkeypatch, tmp_path):
    view, server, socket, stop_workers = runtime(monkeypatch, busy=True)
    desktop.run_application(tmp_path)
    assert 'Close the other copy' in view.create_window.call_args.kwargs['html']
    assert not server.started
    stop_workers.assert_not_called()
    socket.close.assert_called_once()


def test_startup_message_escapes_user_owned_path():
    html = desktop.startup_page('Try <again>', 'Close & reopen', 'folder/<script>alert(1)</script>')
    assert '<script>' not in html
    assert 'Try &lt;again&gt;' in html
    assert 'Close &amp; reopen' in html


def test_missing_browser_runtime_shows_native_repair_instruction(monkeypatch, tmp_path):
    from backend import paths
    monkeypatch.setattr(paths, 'DATA_ROOT', tmp_path)
    monkeypatch.setenv('CONTOUR_DESKTOP', '1')
    monkeypatch.setenv('MPLCONFIGDIR', str(tmp_path / 'matplotlib'))
    monkeypatch.setattr(sys, 'platform', 'win32')
    monkeypatch.setattr(desktop, 'run_application', Mock(side_effect=ImportError('browser runtime')))
    dialog = Mock()
    monkeypatch.setattr(desktop, 'native_error', dialog)
    assert desktop.main() == 1
    assert 'repair Microsoft WebView2' in dialog.call_args.args[0]
    assert str(tmp_path / 'desktop.log') in dialog.call_args.args[0]
