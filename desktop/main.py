"""Run the existing local app in a persistent native macOS/Windows window."""
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


def run_application(data_root):
    import uvicorn
    import webview
    from backend.app import app

    browser_options = {'gui': 'edgechromium'} if sys.platform == 'win32' else {}
    # A stable origin preserves browser drafts between launches.
    port = int(os.environ.get('CONTOUR_DESKTOP_PORT', '8767'))
    server_socket = socket.socket()
    try:
        server_socket.bind(('127.0.0.1', port))
    except OSError:
        server_socket.close()
        webview.create_window('Contour Studio', html=startup_page('The app could not open.',
            'Another copy of Contour Studio, or another app, is using its local connection. Close the other copy, then try again.',
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
        updater.window = window
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
