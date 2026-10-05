import pytest
from backend import updates


def release(tag='v1.0.0-rc.3', filename='Contour-Studio-Windows-x64-Setup.exe', **extra):
    return {'tag_name': tag, 'html_url': f'{updates.RELEASES_URL}/tag/{tag}', 'body': 'Changes',
            'assets': [{'name': filename, 'state': 'uploaded', 'size': 100,
                        'browser_download_url': f'{updates.RELEASES_URL}/download/{tag}/{filename}'}], **extra}


def test_preview_and_stable_ordering():
    assert updates.version_key('1.0.0-rc.10') > updates.version_key('1.0.0-rc.2')
    assert updates.version_key('1.0.0') > updates.version_key('1.0.0-rc.99')
    assert updates.select_release([release('v1.0.0')])['status'] == 'available'
    assert updates.select_release([release('v1.1.0-rc.1', prerelease=True)], current='1.0.0')['status'] == 'current'
    assert updates.select_release([release('v1.0.0-rc.2')])['status'] == 'current'
    assert updates.select_release([release('v0.9.0')])['status'] == 'current'


def test_release_selection_requires_published_platform_installer():
    name = 'Contour-Studio-Windows-x64-Setup.exe'
    assert updates.select_release([release(draft=True)], filename=name)['status'] == 'current'
    assert updates.select_release([release(filename='different.dmg')], filename=name)['status'] == 'current'
    result = updates.select_release([release(), release('v1.0.0-rc.10')], current='1.0.0-rc.9', filename=name)
    assert result['latest_version'] == '1.0.0-rc.10'
    assert result['download_url'].endswith(name)
    assert updates.select_release([release('v1.0.0-rc.10')], current='1.0.0-rc.10', filename=name)['status'] == 'current'


def test_untrusted_and_malformed_releases():
    item = release()
    item['assets'][0]['browser_download_url'] = 'https://example.com/evil.exe'
    assert updates.select_release([item], filename=item['assets'][0]['name'])['status'] == 'current'
    assert updates.select_release([release(html_url='javascript:alert(1)'), release('main')])['status'] == 'current'
    with pytest.raises(ValueError):
        updates.select_release({'message': 'API error'})


@pytest.mark.parametrize('system,machine,expected', [('win32', 'AMD64', 'Contour-Studio-Windows-x64-Setup.exe'),
    ('darwin', 'arm64', 'Contour-Studio-macOS-arm64.dmg'), ('darwin', 'x86_64', 'Contour-Studio-macOS-x86_64.dmg'),
    ('linux', 'x86_64', None), ('win32', 'ARM64', None)])
def test_installer_platform(monkeypatch, system, machine, expected):
    monkeypatch.setattr(updates.sys, 'platform', system)
    monkeypatch.setattr(updates.platform, 'machine', lambda: machine)
    assert updates.installer_name() == expected


def test_api_failure_and_desktop_only(monkeypatch):
    from fastapi.testclient import TestClient
    from backend.app import app
    client = TestClient(app)
    monkeypatch.delenv('CONTOUR_DESKTOP', raising=False)
    assert client.get('/api/updates').json()['desktop'] is False
    assert client.get('/api/updates/check').status_code == 404
    monkeypatch.setenv('CONTOUR_DESKTOP', '1')
    def fail():
        raise RuntimeError('offline')
    monkeypatch.setattr(updates, 'check_updates', fail)
    assert client.get('/api/updates/check').status_code == 503
    monkeypatch.setattr(updates, 'check_updates', lambda: {'status': 'current'})
    assert client.get('/api/updates/check').json()['status'] == 'current'
