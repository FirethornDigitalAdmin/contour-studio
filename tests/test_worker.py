"""Exercise real subprocess IPC and API responsiveness during CPU-heavy work."""
from concurrent.futures import ThreadPoolExecutor
from threading import Event
import json
import subprocess
import sys
import time

from fastapi.testclient import TestClient
import pytest

import backend.app as server
import backend.worker as worker


def controlled_process(monkeypatch, script):
    original = subprocess.Popen
    def launch(args, **kwargs):
        # Only the child model body is controlled; stdin/stdout/stderr, process
        # isolation and the production parent API/worker are real.
        return original([sys.executable, '-c', script, args[-1]], **kwargs)
    monkeypatch.setattr(worker.subprocess, 'Popen', launch)


def test_api_remains_responsive_during_model_process(monkeypatch, tmp_path):
    controlled_process(monkeypatch, '''
import json,sys,time,zipfile
from pathlib import Path
settings=json.loads(sys.stdin.read())
print(json.dumps({'type':'progress','percent':40,'message':'Heavy geometry'}),flush=True)
end=time.monotonic()+2
while time.monotonic()<end: sum(i*i for i in range(5000))
folder=Path(sys.argv[1]);folder.mkdir(parents=True)
(folder/'model-info.json').write_text(json.dumps({'name':settings['name']}))
with zipfile.ZipFile(folder/'project.zip','w') as archive: archive.writestr('settings.json',json.dumps(settings))
print(json.dumps({'type':'progress','percent':100,'message':'Ready'}),flush=True)
''')
    pool = ThreadPoolExecutor(max_workers=1)
    monkeypatch.setattr(server, 'executor', pool)
    monkeypatch.setattr(server, 'jobs', {})
    monkeypatch.setattr(server, 'OUTPUT', tmp_path)
    started = Event()
    original = worker.build_project
    def build(settings, folder, progress):
        def update(percent, message):
            progress(percent, message)
            if percent == 40: started.set()
        return original(settings, folder, update)
    monkeypatch.setattr(server, 'build_project', build)
    try:
        with TestClient(server.app) as client:
            created = client.post('/api/generate', json={'name': 'Isolated worker'}).json()
            assert started.wait(5)
            before = time.monotonic()
            assert client.get('/api/health').json()['status'] == 'ok'
            active = client.get('/api/active-job').json()
            assert active['progress'] == 40
            assert active['id'] == created['id']
            assert client.post('/api/generate', json={}).status_code == 409
            assert time.monotonic() - before < 1.5
            pool.shutdown(wait=True)
            job = client.get('/api/jobs/' + created['id']).json()
            assert job['status'] == 'complete'
            assert job['result']['name'] == 'Isolated worker'
    finally:
        pool.shutdown(wait=True)


def test_child_failure_is_reported_and_no_package_is_published(monkeypatch, tmp_path):
    controlled_process(monkeypatch, '''
import json,sys
json.loads(sys.stdin.read())
print(json.dumps({'type':'progress','percent':32,'message':'Building'}),flush=True)
print(json.dumps({'type':'error','message':'Field texture exceeds printer height'}),flush=True)
print('Detailed child diagnostic',file=sys.stderr)
raise SystemExit(1)
''')
    events = []
    with pytest.raises(ValueError, match='Field texture exceeds printer height'):
        worker.build_project(server.Settings(), tmp_path, lambda *args: events.append(args))
    assert events == [(32, 'Building')]
    assert not (tmp_path / 'project.zip').exists()
