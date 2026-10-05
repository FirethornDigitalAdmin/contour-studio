"""Startup failures must leave a usable explanation and release the local port."""
import sys
import errno
import time
from types import SimpleNamespace
from unittest.mock import Mock

from desktop import main as desktop
import ctypes
from threading import Lock


def runtime(monkeypatch, starts=True, busy=False):
    socket = Mock()
    if busy:
        socket.bind.side_effect = OSError(errno.EADDRINUSE, 'address in use')
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
    view, server, socket, stop_workers = runtime(monkeypatch)
    dialog = Mock()
    monkeypatch.setattr(desktop, 'native_error', dialog)
    with desktop.instance_lock(tmp_path):
        desktop.run_application(tmp_path)
    assert 'already running' in dialog.call_args.args[0]
    assert not server.started
    stop_workers.assert_not_called()
    socket.bind.assert_not_called()


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


def test_windows_reserved_port_recovers_and_keeps_origin(monkeypatch, tmp_path, caplog):
    monkeypatch.setattr(sys, 'platform', 'win32')
    monkeypatch.delenv('CONTOUR_DESKTOP_PORT', raising=False)
    blocked, available, reopened = Mock(), Mock(), Mock()
    blocked.bind.side_effect = OSError(errno.EACCES, 'reserved port')
    available.getsockname.return_value = ('127.0.0.1', 51234)
    monkeypatch.setattr(desktop.socket, 'socket', Mock(side_effect=[blocked, available, reopened]))
    connection, port = desktop.bind_local_connection(tmp_path)
    assert connection is available and port == 51234
    blocked.close.assert_called_once()
    available.bind.assert_called_once_with(('127.0.0.1', 0))
    assert (tmp_path / 'desktop-port.txt').read_text() == '51234'
    assert 'errno=13' in caplog.text
    connection, port = desktop.bind_local_connection(tmp_path)
    assert connection is reopened and port == 51234
    reopened.bind.assert_called_once_with(('127.0.0.1', 51234))


def test_busy_explicit_port_recovers_automatically(monkeypatch, tmp_path):
    monkeypatch.setattr(sys, 'platform', 'win32')
    monkeypatch.setenv('CONTOUR_DESKTOP_PORT', '18767')
    blocked, available = Mock(), Mock()
    blocked.bind.side_effect = OSError(errno.EADDRINUSE, 'busy')
    available.getsockname.return_value = ('127.0.0.1', 51234)
    factory = Mock(side_effect=[blocked, available])
    monkeypatch.setattr(desktop.socket, 'socket', factory)
    connection, port = desktop.bind_local_connection(tmp_path)
    assert connection is available and port == 51234
    assert factory.call_count == 2
    blocked.close.assert_called_once()
    assert (tmp_path / 'desktop-port.txt').read_text() == '51234'


def test_unexpected_connection_error_is_logged_without_claiming_second_copy(monkeypatch, tmp_path, caplog):
    view, server, connection, stop_workers = runtime(monkeypatch)
    connection.bind.side_effect = OSError(errno.EADDRNOTAVAIL, 'address unavailable')
    desktop.run_application(tmp_path)
    html = view.create_window.call_args.kwargs['html']
    assert 'Another copy' not in html
    assert 'connection error' in html
    assert 'address unavailable' in caplog.text
    stop_workers.assert_not_called()
    connection.close.assert_called_once()


def test_windows_recovery_closes_socket_when_fallback_fails(monkeypatch, tmp_path):
    import pytest
    monkeypatch.setattr(sys, 'platform', 'win32')
    monkeypatch.delenv('CONTOUR_DESKTOP_PORT', raising=False)
    blocked, fallback = Mock(), Mock()
    blocked.bind.side_effect = OSError(errno.EACCES, 'reserved')
    fallback.bind.side_effect = OSError(errno.EACCES, 'all connections blocked')
    monkeypatch.setattr(desktop.socket, 'socket', Mock(side_effect=[blocked, fallback]))
    with pytest.raises(OSError):
        desktop.bind_local_connection(tmp_path)
    blocked.close.assert_called_once()
    fallback.close.assert_called_once()


def test_busy_port_uses_real_os_selected_socket_and_reuses_it(monkeypatch, tmp_path):
    monkeypatch.delenv('CONTOUR_DESKTOP_PORT', raising=False)
    with desktop.socket.socket() as occupied:
        occupied.bind(('127.0.0.1', 0))
        occupied.listen()
        preferred = occupied.getsockname()[1]
        (tmp_path / 'desktop-port.txt').write_text(str(preferred))
        connection, chosen = desktop.bind_local_connection(tmp_path)
        try:
            assert chosen != preferred
            assert connection.getsockname() == ('127.0.0.1', chosen)
            assert (tmp_path / 'desktop-port.txt').read_text() == str(chosen)
        finally:
            connection.close()
        reopened, port = desktop.bind_local_connection(tmp_path)
        try:
            assert port == chosen
        finally:
            reopened.close()


def test_instance_lock_released_after_exception(tmp_path):
    import pytest
    with pytest.raises(RuntimeError):
        with desktop.instance_lock(tmp_path):
            raise RuntimeError('startup failed')
    with desktop.instance_lock(tmp_path):
        pass


def test_windows_instance_lock_rejects_duplicate_and_unlocks(monkeypatch, tmp_path):
    import os
    import pytest
    held = set()

    def locking(descriptor, mode, length):
        assert length == 1
        if mode == 1:
            if held:
                raise OSError(errno.EACCES, 'lock already held')
            held.add(descriptor)
        else:
            held.remove(descriptor)

    monkeypatch.setitem(sys.modules, 'msvcrt', SimpleNamespace(LK_NBLCK=1, LK_UNLCK=2, locking=locking))
    monkeypatch.setattr(desktop, 'os', SimpleNamespace(name='nt', SEEK_END=os.SEEK_END))
    with desktop.instance_lock(tmp_path):
        with pytest.raises(desktop.AlreadyRunningError):
            with desktop.instance_lock(tmp_path):
                pass
    assert not held
    with desktop.instance_lock(tmp_path):
        pass
    assert not held
