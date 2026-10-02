"""Run native modelling outside the API process so its GIL stays available."""
import json
import logging
import os
import subprocess
import sys
import tempfile
import signal
from threading import Lock
from pathlib import Path

from .config import Settings
from .paths import worker_command, subprocess_options, RESOURCE_ROOT


ACTIVE_WORKERS = set()
WORKER_LOCK = Lock()


def stop_workers():
    with WORKER_LOCK:
        children = list(ACTIVE_WORKERS)
    for child in children:
        if child.poll() is not None:
            continue
        if sys.platform == 'win32':
            subprocess.run(['taskkill', '/PID', str(child.pid), '/T', '/F'],
                           capture_output=True, **subprocess_options())
        else:
            try:
                os.killpg(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass


def build_project(settings, folder, progress):
    root = RESOURCE_ROOT
    error_message = None
    # Native mesh calls can hold Python's GIL for many seconds. A subprocess
    # keeps job status, project browsing and static files responsive throughout.
    # stderr goes to a file so a noisy data provider cannot fill a pipe.
    with tempfile.TemporaryFile(mode='w+b') as errors:
        process = subprocess.Popen(
            worker_command('backend.worker', str(Path(folder).resolve())),
            cwd=root, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=errors,
            env={**os.environ, 'PYTHONIOENCODING': 'utf-8'},
            text=True, encoding='utf-8', bufsize=1, start_new_session=sys.platform != 'win32', **subprocess_options(),
        )
        with WORKER_LOCK:
            ACTIVE_WORKERS.add(process)
        try:
            process.stdin.write(settings.model_dump_json())
            process.stdin.close()
            for line in process.stdout:
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if event.get('type') == 'progress':
                    progress(event['percent'], event['message'])
                elif event.get('type') == 'error':
                    error_message = event['message']
            code = process.wait()
        except BaseException:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            raise
        finally:
            with WORKER_LOCK:
                ACTIVE_WORKERS.discard(process)
            process.stdout.close()
        if code != 0:
            errors.seek(0)
            diagnostic = errors.read().decode('utf-8', errors='replace')[-12000:]
            logging.error('Model worker exited with code %s:\n%s', code, diagnostic)
            raise ValueError(error_message or 'The model worker stopped unexpectedly. Try a smaller area or lower surface quality.')
    info_path = Path(folder) / 'model-info.json'
    if not info_path.is_file() or not (Path(folder) / 'project.zip').is_file():
        raise ValueError('The model worker did not publish a complete print package.')
    return json.loads(info_path.read_text(encoding='utf-8'))


def main():
    from .export import build_project as generate
    def emit(event):
        print(json.dumps(event), flush=True)
    try:
        settings = Settings.model_validate_json(sys.stdin.read())
        generate(settings, Path(sys.argv[1]), lambda percent, message: emit(
            {'type': 'progress', 'percent': percent, 'message': message}))
    except Exception as exc:
        emit({'type': 'error', 'message': str(exc)})
        logging.exception('Model generation failed')
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
