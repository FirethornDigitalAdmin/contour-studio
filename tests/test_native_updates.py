import hashlib
import subprocess
import sys
from pathlib import Path
from unittest.mock import Mock

import httpx
import pytest
from desktop import updater


def test_checksum_mismatch_removes_partial_download(tmp_path, monkeypatch):
    class Response:
        headers = {'content-length': '3'}
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def raise_for_status(self): pass
        def iter_bytes(self, size): yield b'bad'
    monkeypatch.setattr(httpx, 'stream', lambda *args, **kwargs: Response())
    destination = tmp_path / 'installer.dmg'
    with pytest.raises(ValueError, match='verification'):
        updater.download_verified('https://github.com/FirethornDigitalAdmin/contour-studio/releases/download/v1.0.0/installer.dmg',
                                  hashlib.sha256(b'good').hexdigest(), destination, lambda value: None)
    assert not destination.exists()


def test_download_verifies_bytes_and_reports_progress(tmp_path, monkeypatch):
    class Response:
        headers = {'content-length': '6'}
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def raise_for_status(self): pass
        def iter_bytes(self, size): yield b'abc'; yield b'def'
    monkeypatch.setattr(httpx, 'stream', lambda *args, **kwargs: Response())
    destination = tmp_path / 'installer.dmg'
    progress = []
    updater.download_verified('https://github.com/FirethornDigitalAdmin/contour-studio/releases/download/v1.0.0/installer.dmg',
                              hashlib.sha256(b'abcdef').hexdigest(), destination, progress.append)
    assert destination.read_bytes() == b'abcdef'
    assert progress == [50, 99]


def test_untrusted_download_never_starts(tmp_path, monkeypatch):
    request = Mock()
    monkeypatch.setattr(httpx, 'stream', request)
    with pytest.raises(ValueError, match='repository'):
        updater.download_verified('https://example.com/app.exe', '0' * 64, tmp_path / 'installer', lambda value: None)
    request.assert_not_called()


def test_failed_launch_restores_existing_app(tmp_path, monkeypatch):
    candidate = tmp_path / 'candidate.app'; candidate.mkdir(); (candidate / 'version').write_text('new')
    target = tmp_path / 'Contour Studio.app'; target.mkdir(); (target / 'version').write_text('old')
    import shutil
    def run(command, **kwargs):
        if command[0] == 'ditto':
            shutil.copytree(command[1], command[2])
        else:
            raise subprocess.CalledProcessError(1, command)
    monkeypatch.setattr(subprocess, 'run', run)
    with pytest.raises(subprocess.CalledProcessError):
        updater.replace_mac(candidate, target)
    assert (target / 'version').read_text() == 'old'
    assert not list(tmp_path.glob('.Contour-*'))


def test_busy_app_rejects_install_without_download(tmp_path):
    bridge = updater.UpdateBridge(tmp_path, lambda: True)
    assert bridge.install_update()['status'] == 'error'
    assert bridge.update_status()['status'] == 'idle'
    assert not (tmp_path / 'updates').exists()


def test_failed_preparation_releases_generation_reservation(tmp_path, monkeypatch):
    released = Mock()
    monkeypatch.setattr(updater, 'installed_target', Mock(side_effect=ValueError('Read only')))
    bridge = updater.UpdateBridge(tmp_path, lambda: False, released)
    bridge._prepare()
    assert bridge.update_status() == {'status': 'error', 'message': 'Read only'}
    released.assert_called_once()


def test_running_app_is_never_replaced_after_exit_timeout(monkeypatch):
    monkeypatch.setattr(updater.os, 'kill', lambda *args: None)
    with pytest.raises(TimeoutError, match='not been changed'):
        updater.wait_for_exit(1234, timeout=0)


def test_installation_reservation_blocks_new_models(monkeypatch):
    from backend.app import app
    from fastapi.testclient import TestClient
    app.state.update_installing = True
    try:
        response = TestClient(app).post('/api/generate', json={})
        assert response.status_code == 409
        assert 'update' in response.json()['detail']
    finally:
        app.state.update_installing = False
