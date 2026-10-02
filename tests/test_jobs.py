from concurrent.futures import ThreadPoolExecutor
from threading import Event
import json
import zipfile

from fastapi.testclient import TestClient
import pytest

import backend.app as server


@pytest.fixture
def client(monkeypatch, tmp_path):
    worker = ThreadPoolExecutor(max_workers=1)
    monkeypatch.setattr(server, 'executor', worker)
    monkeypatch.setattr(server, 'jobs', {})
    monkeypatch.setattr(server, 'OUTPUT', tmp_path)
    with TestClient(server.app) as client:
        yield client
    worker.shutdown(wait=True)


def test_refresh_can_find_running_job_and_its_settings(client, monkeypatch):
    started, release = Event(), Event()

    def build(settings, output, update):
        update(37, 'Building terrain')
        started.set()
        assert release.wait(10)
        return {'name': settings.name}

    monkeypatch.setattr(server, 'build_project', build)
    settings = server.Settings(name='My local artwork').model_dump()
    assert client.get('/api/active-job').json() is None
    created = client.post('/api/generate', json=settings)
    try:
        assert created.status_code == 202
        assert started.wait(5)
        active = client.get('/api/active-job').json()
        assert active['id'] == created.json()['id']
        assert active['settings'] == settings
        assert active['progress'] == 37
        assert active['status'] == 'running'
        assert client.post('/api/generate', json=settings).status_code == 409
        assert client.get('/api/active-job').json()['id'] == active['id']
    finally:
        release.set()
    server.executor.shutdown(wait=True)
    assert client.get('/api/active-job').json() is None
    assert client.get('/api/jobs/' + created.json()['id']).json()['status'] == 'complete'


def test_failed_worker_does_not_block_next_generation(client, monkeypatch):
    def fail(*args):
        raise ValueError('Data unavailable')

    monkeypatch.setattr(server, 'build_project', fail)
    first = client.post('/api/generate', json=server.Settings().model_dump()).json()
    server.executor.submit(lambda: None).result(timeout=5)
    assert client.get('/api/active-job').json() is None
    assert client.get('/api/jobs/' + first['id']).json()['message'] == 'Data unavailable'
    assert client.post('/api/generate', json=server.Settings().model_dump()).status_code == 202


def test_unavailable_executor_does_not_leave_a_queued_job(client):
    server.executor.shutdown(wait=True)
    response = client.post('/api/generate', json=server.Settings().model_dump())
    assert response.status_code == 503
    assert client.get('/api/active-job').json() is None


def test_missing_job_returns_404_after_server_restart(client):
    assert client.get('/api/jobs/interrupted-job').status_code == 404


def save_project(root, name='Saved artwork', corrupt=False):
    root.mkdir()
    settings=server.Settings(name=name).model_dump()
    info={'name':name,'created_at':'2026-10-02T12:00:00+00:00','layout':{'columns':3,'rows':2},
          'settings':settings,'parts':[{'id':'A1'}]}
    (root/'model-info.json').write_text('{broken' if corrupt else json.dumps(info))
    with zipfile.ZipFile(root/'project.zip','w') as archive:
        archive.writestr('settings.json',json.dumps(settings))
    return info


def test_library_skips_corrupt_projects_and_includes_all_saved_artworks(client):
    save_project(server.OUTPUT/'broken',corrupt=True)
    for i in range(24):
        save_project(server.OUTPUT/f'project-{i}',name=f'Artwork {i}')
    result=client.get('/api/projects')
    assert result.status_code == 200
    assert len(result.json()) == 24
    assert {p['name'] for p in result.json()} == {f'Artwork {i}' for i in range(24)}
    assert result.json()[0]['width'] == 600
    assert result.json()[0]['frame_mode'] == 'integrated'
    assert result.json()[0]['part_count'] == 1
    assert client.get('/api/jobs/broken').status_code == 404


def test_restart_recovers_completed_settings_and_rejects_invalid_archive(client):
    info=save_project(server.OUTPUT/'saved')
    result=client.get('/api/jobs/saved').json()
    assert result['status'] == 'complete'
    assert result['settings'] == info['settings']
    (server.OUTPUT/'saved'/'project.zip').write_bytes(b'incomplete archive')
    assert client.get('/api/jobs/saved').status_code == 404
    assert client.get('/api/projects').json() == []


def test_validation_normalizes_settings_and_reports_import_errors(client):
    response=client.post('/api/validate',json={'name':'  My artwork  '})
    assert response.status_code == 200
    assert response.json()['name'] == 'My artwork'
    assert response.json()['terrain_style'] == 'smooth'
    for changes in [{'name':'  '},{'unexpected':True},{'bounds':{'unexpected':True}},
                    {'markers':[{'id':'  ','lon':0,'lat':0}]},
                    {'frame_mode':'separate','frame_width':4,'joints':True}]:
        assert client.post('/api/validate',json=changes).status_code == 422
    # Inactive frame controls must not prevent a frame-free artwork.
    assert client.post('/api/validate',json={'frame_mode':'none','frame_width':4,
                                            'corner_radius':15,'inner_bevel':4,'outer_bevel':4}).status_code == 200


def test_project_path_cannot_escape_the_output_directory(client):
    with pytest.raises(server.HTTPException) as error:
        server.job('../outside')
    assert error.value.status_code == 400
    with pytest.raises(server.HTTPException) as error:
        server.files('../outside','model-info.json')
    assert error.value.status_code == 400


def test_location_search_trims_and_rejects_blank_queries(client,monkeypatch):
    monkeypatch.setattr(server,'search',lambda q:[{'query':q}])
    assert client.get('/api/search',params={'q':'  York  '}).json() == [{'query':'York'}]
    assert client.get('/api/search',params={'q':'   '}).status_code == 400


@pytest.mark.parametrize('symbol',['heart','star','pin'])
@pytest.mark.parametrize('endpoint',['/api/validate','/api/generate'])
def test_marker_footprint_preflight_blocks_edge_badges_before_worker(client,monkeypatch,symbol,endpoint):
    def forbidden(*args):
        pytest.fail('No model worker or data download may start for an invalid marker footprint')
    monkeypatch.setattr(server,'build_project',forbidden)
    monkeypatch.setattr(server.Geography,'elevation',forbidden)
    monkeypatch.setattr(server.Geography,'vectors',forbidden)
    bounds=server.Settings().bounds
    marker={'id':'edge','label':'Home','symbol':symbol,'lon':bounds.east-0.00001,
            'lat':(bounds.south+bounds.north)/2,'size':8,'rise':3}
    settings=server.Settings(width=100,height=100,frame_mode='none',markers=[marker]).model_dump()
    response=client.post(endpoint,json=settings)
    assert response.status_code == 422
    assert 'Home' in response.json()['detail']
    assert 'too close' in response.json()['detail']
    assert server.jobs == {}


@pytest.mark.parametrize('endpoint',['/api/validate','/api/generate'])
def test_legacy_pin_footprint_is_also_preflighted(client,monkeypatch,endpoint):
    def forbidden(*args):
        pytest.fail('An invalid legacy pin must not reach the worker')
    monkeypatch.setattr(server,'build_project',forbidden)
    settings=server.Settings(marker=True,marker_lon=server.Settings().bounds.west).model_dump()
    response=client.post(endpoint,json=settings)
    assert response.status_code == 422
    assert 'Custom marker' in response.json()['detail']
    assert server.jobs == {}


@pytest.mark.parametrize('frame_mode',['integrated','separate','none'])
def test_valid_central_marker_can_validate_and_start_generation(client,monkeypatch,frame_mode):
    called=Event()
    def build(settings,output,update):
        called.set()
        return {'name':settings.name}
    monkeypatch.setattr(server,'build_project',build)
    bounds=server.Settings().bounds
    settings=server.Settings(width=100,height=100,frame_mode=frame_mode,
        markers=[{'id':'centre','label':'Home','symbol':'heart','lon':(bounds.west+bounds.east)/2,
                  'lat':(bounds.south+bounds.north)/2,'size':30,'rise':3}]).model_dump()
    assert client.post('/api/validate',json=settings).json() == settings
    assert client.post('/api/generate',json=settings).status_code == 202
    assert called.wait(5)
