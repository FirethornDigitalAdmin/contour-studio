"""Run the existing local app in a persistent native macOS/Windows window."""
import errno
from contextlib import contextmanager
import logging
from html import escape
import multiprocessing
import os
import socket
import subprocess
import sys
import threading
import time


def startup_page(title, message, log_path):
    """Keep startup recovery readable even when the main workspace is unavailable."""
    return f'''<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Contour Studio</title><style>
    body {{margin:0;padding:40px;background:#fcfbf7;color:#253c34;font:16px/1.6 system-ui,"Segoe UI",sans-serif}}
    main {{max-width:560px;margin:auto}} .brand {{font-weight:700;color:#51755b}}
    h1 {{font-size:27px;line-height:1.2}} details {{margin-top:28px}} summary {{cursor:pointer}}
    code {{display:block;overflow-wrap:anywhere;font-size:13px;user-select:all}}
    </style><main><div class="brand">Contour Studio</div><h1>{escape(title)}</h1>
    <p>{escape(message)}</p><p>Your saved projects stay on this computer.</p>
    <details><summary>Diagnostic log</summary><p>Open this file if you need help:</p>
    <code>{escape(str(log_path))}</code></details></main></html>'''


def native_error(message):
    """A native dialog also works when the browser runtime itself cannot open."""
    if sys.platform == 'win32':
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, message, 'Contour Studio', 0x10)
    elif sys.platform == 'darwin':
        # Pass the message as an argument, never as executable AppleScript text.
        subprocess.run(['osascript', '-e', 'on run argv', '-e',
                        'display dialog (item 1 of argv) with title "Contour Studio" buttons {"Close"} default button "Close"',
                        '-e', 'end run', message], check=False)
    else:
        print(message, file=sys.stderr)


def window_options():
    options = {'width': 1440, 'height': 960, 'min_size': (900, 650)}
    if sys.platform == 'win32':
        import ctypes
        user32 = ctypes.windll.user32
        scale = max(1, getattr(user32, 'GetDpiForSystem', lambda: 96)() / 96)
        # Match the screen's logical size before pywebview applies its DPI scale.
        # Leave space for window chrome and the taskbar when restoring the window.
        width = min(1440, max(360, int(user32.GetSystemMetrics(0) / scale) - 40))
        height = min(960, max(280, int(user32.GetSystemMetrics(1) / scale) - 80))
        options = {'width': width, 'height': height,
                   'min_size': (min(800, width), min(480, height)), 'maximized': True}
    return options


def bind_local_connection(data_root):
    """Keep the browser origin stable, including after a Windows port reservation."""
    preference = data_root / 'desktop-port.txt'
    override = os.environ.get('CONTOUR_DESKTOP_PORT')
    port = 8767
    if override:
        port = int(override)
    else:
        try:
            saved = int(preference.read_text(encoding='ascii').strip())
            if 1024 <= saved <= 65535:
                port = saved
        except (OSError, ValueError):
            pass
    connection = socket.socket()
    try:
        connection.bind(('127.0.0.1', port))
    except OSError as error:
        logging.exception('Cannot bind local connection 127.0.0.1:%s (errno=%s, winerror=%s)',
                          port, error.errno, getattr(error, 'winerror', None))
        connection.close()
        # Binding to zero asks the operating system to select and reserve a
        # free port atomically, avoiding a scan/check-then-bind race.
        if not (error.errno in (errno.EACCES, errno.EADDRINUSE)
                or getattr(error, 'winerror', None) in (10013, 10048)):
            raise
        connection = socket.socket()
        try:
            connection.bind(('127.0.0.1', 0))
            port = connection.getsockname()[1]
            preference.write_text(str(port), encoding='ascii')
        except Exception:
            connection.close()
            raise
        logging.info('Using available local connection 127.0.0.1:%s; saved for future launches', port)
    return connection, port


class AlreadyRunningError(Exception):
    pass


@contextmanager
def instance_lock(data_root):
    """An OS-owned lock distinguishes our app from an unrelated busy port."""
    handle = (data_root / 'desktop-instance.lock').open('a+b')
    acquired = False
    try:
        if os.name == 'nt':
            import msvcrt
            if handle.seek(0, os.SEEK_END) == 0:
                handle.write(b'0')
                handle.flush()
            handle.seek(0)
            try:
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError as error:
                if error.errno in (errno.EACCES, errno.EAGAIN, errno.EDEADLK):
                    raise AlreadyRunningError from error
                raise
        else:
            import fcntl
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise AlreadyRunningError from error
        acquired = True
        yield
    finally:
        try:
            if acquired:
                if os.name == 'nt':
                    handle.seek(0)
                    msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(handle, fcntl.LOCK_UN)
        finally:
            handle.close()


def run_application(data_root):
    try:
        with instance_lock(data_root):
            _run_application(data_root)
    except AlreadyRunningError:
        native_error('Contour Studio is already running. Switch to its open window to continue.')


def _run_application(data_root):
    import uvicorn
    import webview
    from backend.app import app

    browser_options = {'gui': 'edgechromium'} if sys.platform == 'win32' else {}
    # A stable origin preserves browser drafts between launches.
    try:
        server_socket, port = bind_local_connection(data_root)
    except OSError:
        logging.exception('Automatic local connection recovery failed')
        message = 'The system could not open the app’s local connection. The diagnostic log below contains the connection error.'
        webview.create_window('Contour Studio', html=startup_page('The app could not open.',
            message,
            data_root / 'desktop.log'), width=640, height=440, background_color='#fcfbf7')
        webview.start(**browser_options)
        return
    config = uvicorn.Config(app, host='127.0.0.1', port=port, log_level='warning')
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, kwargs={'sockets': [server_socket]}, daemon=True)
    try:
        thread.start()
        deadline = time.monotonic() + 20
        while not server.started and thread.is_alive() and time.monotonic() < deadline:
            time.sleep(.05)
        if not server.started:
            logging.error('The local generation engine could not start.')
            webview.create_window('Contour Studio', html=startup_page('The app could not start.',
                'Close this window and open Contour Studio again. If this continues, use the diagnostic log below when asking for help.',
                data_root / 'desktop.log'), width=640, height=440, background_color='#fcfbf7')
            webview.start(**browser_options)
            return
        webview.settings['ALLOW_DOWNLOADS'] = True
        webview.settings['OPEN_EXTERNAL_LINKS_IN_BROWSER'] = True
        from desktop.updater import UpdateBridge
        from backend.app import jobs, lock
        def generation_busy():
            with lock:
                busy = any(job.get('status') in ('queued', 'running') for job in jobs.values())
                if not busy:
                    app.state.update_installing = True
                return busy
        def release_update():
            with lock:
                app.state.update_installing = False
        updater = UpdateBridge(data_root, generation_busy, release_update)
        window = webview.create_window('Contour Studio', f'http://127.0.0.1:{port}', **window_options(),
                              background_color='#fcfbf7', confirm_close=False, text_select=True, js_api=updater)
        updater._window = window
        from desktop.menus import studio_menu
        webview.start(menu=studio_menu(window), private_mode=False, storage_path=str(data_root / 'browser'), **browser_options)
    finally:
        from backend.worker import stop_workers
        stop_workers()
        server.should_exit = True
        if thread.ident is not None:
            thread.join(timeout=5)
        server_socket.close()


def main():
    os.environ['CONTOUR_DESKTOP'] = '1'
    log_path = None
    try:
        from backend.paths import DATA_ROOT
        DATA_ROOT.mkdir(parents=True, exist_ok=True)
        os.environ.setdefault('MPLCONFIGDIR', str(DATA_ROOT / 'matplotlib'))
        log_path = DATA_ROOT / 'desktop.log'
        # Windowed apps have no console: write diagnostics somewhere user-owned.
        log = log_path.open('a', encoding='utf-8', buffering=1)
        if sys.stdout is None:
            sys.stdout = log
        if sys.stderr is None:
            sys.stderr = log
        logging.basicConfig(stream=log, level=logging.INFO)
        run_application(DATA_ROOT)
        return 0
    except Exception:
        logging.exception('Desktop startup failed')
        message = 'Contour Studio could not open. Close the app and try again.'
        if sys.platform == 'win32':
            message += '\nRe-run the installer with internet access to repair Microsoft WebView2 if needed.'
        if log_path:
            message += f'\n\nDiagnostic log: {log_path}'
        native_error(message)
        return 1


if __name__ == '__main__':
    multiprocessing.freeze_support()
    # Native work must not keep a closed app alive. Completed packages are atomic
    # and survive; interrupted jobs are reported on the next launch.
    os._exit(main())
