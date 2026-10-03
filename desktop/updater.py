"""Native, user-triggered update staging and replacement; never touches projects."""
import hashlib
import json
import logging
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import time
import uuid


def installed_target():
    if not getattr(sys, 'frozen', False):
        raise ValueError('Install updates from the packaged desktop app.')
    executable = Path(sys.executable).resolve()
    if sys.platform == 'darwin':
        target = next((parent for parent in executable.parents if parent.suffix == '.app'), None)
        if target is None or str(target).startswith('/Volumes/'):
            raise ValueError('Install Contour Studio on this computer before updating it.')
        return target
    if sys.platform == 'win32':
        return executable.parent
    raise ValueError('Updates are supported on macOS and Windows.')


def download_verified(url, digest, destination, progress):
    import httpx
    from backend.updates import REPOSITORY, trusted_url
    if not trusted_url(url, f'/{REPOSITORY}/releases/download/'):
        raise ValueError('The update download is not from Contour Studio’s release repository.')
    if not isinstance(digest, str) or len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
        raise ValueError('This release has no verified installer checksum. Try checking again later.')
    hasher = hashlib.sha256()
    size = 0
    try:
        with httpx.stream('GET', url, follow_redirects=True, timeout=60) as response:
            response.raise_for_status()
            total = int(response.headers.get('content-length', 0))
            with destination.open('wb') as output:
                for chunk in response.iter_bytes(1024 * 256):
                    size += len(chunk)
                    if size > 2 * 1024 ** 3:
                        raise ValueError('The installer exceeds the supported download size.')
                    output.write(chunk)
                    hasher.update(chunk)
                    progress(min(99, int(size * 100 / total)) if total else None)
        if size == 0 or hasher.hexdigest() != digest:
            raise ValueError('The downloaded installer did not pass verification. Try again.')
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def stage_mac(installer, folder, expected_version):
    import plistlib
    mount = folder / 'mount'
    subprocess.run(['hdiutil', 'attach', str(installer), '-mountpoint', str(mount), '-nobrowse', '-readonly'], check=True, capture_output=True)
    candidate = folder / 'Contour Studio.app'
    try:
        source = mount / 'Contour Studio.app'
        with (source / 'Contents' / 'Info.plist').open('rb') as stream:
            info = plistlib.load(stream)
        if info.get('CFBundleIdentifier') != 'studio.contour.desktop':
            raise ValueError('The installer does not contain Contour Studio.')
        subprocess.run(['ditto', str(source), str(candidate)], check=True, capture_output=True)
    finally:
        subprocess.run(['hdiutil', 'detach', str(mount)], check=True, capture_output=True)
    engine = candidate / 'Contents' / 'MacOS' / 'ContourEngine'
    # The new helper reports its full version before any installed files change.
    report = subprocess.run([str(engine), 'desktop.updater', '--version'], check=True, capture_output=True, text=True, timeout=30)
    if report.stdout.strip() != expected_version:
        raise ValueError('The downloaded app version does not match this release.')
    return candidate


def replace_mac(candidate, target, launch=True):
    """Copy first, then swap, retaining the old app until the new one launches."""
    suffix = uuid.uuid4().hex
    replacement = target.parent / f'.Contour-update-{suffix}.app'
    backup = target.parent / f'.Contour-backup-{suffix}.app'
    try:
        subprocess.run(['ditto', str(candidate), str(replacement)], check=True, capture_output=True)
        target.rename(backup)
        try:
            replacement.rename(target)
            if launch:
                subprocess.run(['open', '-n', str(target)], check=True, capture_output=True)
        except Exception:
            if target.exists():
                shutil.rmtree(target)
            backup.rename(target)
            raise
        shutil.rmtree(backup, ignore_errors=True)
    finally:
        shutil.rmtree(replacement, ignore_errors=True)


def wait_for_exit(pid, timeout=90):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            return
        time.sleep(.25)
    raise TimeoutError('The app did not close. Its installed version has not been changed.')


WINDOWS_SCRIPT = r'''param([string]$PlanPath)
$ErrorActionPreference = 'Stop'
$env:PYINSTALLER_RESET_ENVIRONMENT = '1'
$plan = Get-Content -LiteralPath $PlanPath -Raw | ConvertFrom-Json
try {
  if ($plan.ready) { 'ready' | Set-Content -LiteralPath $plan.ready }
  $old = Get-Process -Id $plan.pid -ErrorAction SilentlyContinue
  if ($old -and -not $old.WaitForExit(90000)) { throw 'The current app did not close. Its installed version has not been changed.' }
  $arguments = @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CLOSEAPPLICATIONS', ('/DIR="' + $plan.target + '"'), ('/LOG="' + $plan.log + '"'))
  $result = Start-Process -FilePath $plan.installer -ArgumentList $arguments -Wait -PassThru
  if ($result.ExitCode -ne 0) { throw "Installer exited with code $($result.ExitCode). See $($plan.log)." }
  Start-Process -FilePath (Join-Path $plan.target 'Contour Studio.exe')
  Remove-Item -LiteralPath $plan.folder -Recurse -Force -ErrorAction SilentlyContinue
} catch {
  $_ | Out-File -LiteralPath $plan.error -Encoding UTF8
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show("Contour Studio could not finish updating. Reopen the app and try again. Details: " + $plan.error, 'Contour Studio update')
}
'''


class UpdateBridge:
    def __init__(self, data_root, busy, release_reservation=lambda: None):
        self._root = data_root
        self._busy = busy
        self._release_reservation = release_reservation
        self._window = None
        self._state = {'status': 'idle'}
        self._lock = threading.Lock()
        self._plan = None

    def update_status(self):
        with self._lock:
            return dict(self._state)

    def _set(self, **values):
        with self._lock:
            self._state = values

    def install_update(self):
        with self._lock:
            if self._state['status'] in ('downloading', 'preparing', 'ready', 'installing'):
                return dict(self._state)
            if self._busy():
                return {'status': 'error', 'message': 'Finish model generation before installing an update.'}
            self._state = {'status': 'downloading', 'progress': 0}
        threading.Thread(target=self._prepare, daemon=True).start()
        return self.update_status()

    def _prepare(self):
        folder = None
        try:
            from backend.updates import check_updates, installer_name
            target = installed_target()
            if not os.access(target.parent, os.W_OK) or not os.access(target, os.W_OK):
                raise ValueError('This app location is not writable. Move Contour Studio to a folder you own, then try again.')
            release = check_updates()
            if release['status'] != 'available':
                self._release_reservation()
                self._set(status='current', message='You’re up to date.')
                return
            folder = self._root / 'updates' / uuid.uuid4().hex
            folder.mkdir(parents=True)
            installer = folder / installer_name()
            download_verified(release['download_url'], release.get('download_sha256'), installer,
                              lambda value: self._set(status='downloading', progress=value))
            self._set(status='preparing', message='Verifying and preparing the new app…')
            candidate = stage_mac(installer, folder, release['latest_version']) if sys.platform == 'darwin' else None
            self._plan = {'pid': os.getpid(), 'target': str(target), 'candidate': str(candidate) if candidate else None,
                         'installer': str(installer), 'folder': str(folder), 'log': str(folder / 'install.log'),
                         'error': str(folder / 'error.txt'), 'ready': str(folder / 'helper-ready')}
            self._set(status='ready', message='Ready to install and restart.')
        except Exception as exc:
            self._release_reservation()
            logging.exception('Update preparation failed')
            if folder:
                shutil.rmtree(folder, ignore_errors=True)
            self._set(status='error', message=str(exc))

    def restart_for_update(self):
        with self._lock:
            if self._state['status'] != 'ready' or not self._plan:
                return {'status': 'error', 'message': 'Download the update before installing it.'}
            if self._busy():
                return {'status': 'error', 'message': 'Finish model generation before installing an update.'}
            self._state = {'status': 'installing', 'message': 'Installing and restarting…'}
            plan = dict(self._plan)
        try:
            folder = Path(plan['folder'])
            path = folder / 'plan.json'
            path.write_text(json.dumps(plan))
            if sys.platform == 'darwin':
                engine = Path(plan['candidate']) / 'Contents' / 'MacOS' / 'ContourEngine'
                subprocess.Popen([str(engine), 'desktop.updater', str(path)], start_new_session=True,
                                 stdout=(folder / 'install.log').open('a'), stderr=subprocess.STDOUT)
            else:
                script = folder / 'install.ps1'
                script.write_text(WINDOWS_SCRIPT)
                subprocess.Popen(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(script), str(path)],
                                 creationflags=0x08000000 | 0x00000008)
            deadline = time.monotonic() + 15
            while not Path(plan['ready']).exists() and time.monotonic() < deadline:
                time.sleep(.1)
            if not Path(plan['ready']).exists():
                raise RuntimeError('The installation helper could not start. The current app has not been changed.')
            threading.Timer(.75, self._window.destroy).start()
            return self.update_status()
        except Exception as exc:
            self._release_reservation()
            logging.exception('Update restart failed')
            self._set(status='error', message=str(exc))
            return self.update_status()


def main():
    if sys.argv[1:] == ['--version']:
        from desktop.version import VERSION
        print(VERSION)
        return
    path = Path(sys.argv[1])
    plan = json.loads(path.read_text())
    try:
        if plan.get('ready'):
            Path(plan['ready']).write_text('ready')
        wait_for_exit(plan['pid'])
        replace_mac(Path(plan['candidate']), Path(plan['target']))
        shutil.rmtree(plan['folder'], ignore_errors=True)
    except Exception as exc:
        Path(plan['error']).write_text(str(exc))
        from desktop.main import native_error
        native_error('Contour Studio could not finish updating. Reopen the app and try again. Details: ' + plan['error'])


if __name__ == '__main__':
    main()
