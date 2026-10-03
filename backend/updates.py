"""Read-only release discovery. Downloads open in the user's browser."""
import os
import platform
import re
import sys
from urllib.parse import urlsplit

import httpx
from desktop.version import VERSION

REPOSITORY = 'FirethornDigitalAdmin/contour-studio'
RELEASES_URL = f'https://github.com/{REPOSITORY}/releases'
API_URL = f'https://api.github.com/repos/{REPOSITORY}/releases?per_page=30'


def version_key(value):
    match = re.fullmatch(r'v?(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?', value)
    if not match:
        raise ValueError('Unsupported release version')
    major, minor, patch, stage, number = match.groups()
    return (int(major), int(minor), int(patch), {None: 3, 'rc': 2, 'beta': 1, 'alpha': 0}[stage], int(number or 0))


def installer_name():
    machine = platform.machine().lower()
    if sys.platform == 'win32' and machine in ('amd64', 'x86_64'):
        return 'Contour-Studio-Windows-x64-Setup.exe'
    if sys.platform == 'darwin' and machine in ('arm64', 'aarch64', 'x86_64'):
        return f'Contour-Studio-macOS-{"arm64" if machine in ("arm64", "aarch64") else "x86_64"}.dmg'
    return None


def info():
    return {'desktop': bool(os.environ.get('CONTOUR_DESKTOP')), 'current_version': VERSION,
            'releases_url': RELEASES_URL, 'installer_name': installer_name()}


def trusted_url(value, prefix):
    if not isinstance(value, str):
        return False
    url = urlsplit(value)
    return url.scheme == 'https' and url.netloc == 'github.com' and url.path.startswith(prefix)


def select_release(releases, current=VERSION, filename=None):
    if not isinstance(releases, list):
        raise ValueError('Invalid release response')
    current_key = version_key(current)
    candidates = []
    for release in releases:
        if not isinstance(release, dict) or release.get('draft'):
            continue
        try:
            key = version_key(release.get('tag_name', ''))
        except (ValueError, TypeError):
            continue
        # Stable users stay on stable; preview users can receive newer previews.
        if key <= current_key or (current_key[3] == 3 and (release.get('prerelease') or key[3] < 3)):
            continue
        page = release.get('html_url')
        if not trusted_url(page, f'/{REPOSITORY}/releases/tag/'):
            continue
        download = None
        for asset in release.get('assets') or []:
            if asset.get('name') == filename and asset.get('state') == 'uploaded' and asset.get('size', 0) > 0:
                url = asset.get('browser_download_url')
                if trusted_url(url, f'/{REPOSITORY}/releases/download/'):
                    download = url
        # Don't advertise releases before this platform's installer is ready.
        if filename and not download:
            continue
        candidates.append((key, {'latest_version': release['tag_name'].removeprefix('v'),
            'release_notes': str(release.get('body') or '')[:20000],
            'release_url': page, 'download_url': download}))
    if not candidates:
        return {'status': 'current'}
    return {'status': 'available', **max(candidates, key=lambda candidate: candidate[0])[1]}


def check_updates():
    with httpx.Client(timeout=8, follow_redirects=False) as client:
        response = client.get(API_URL, headers={'Accept': 'application/vnd.github+json',
            'User-Agent': f'Contour-Studio/{VERSION}'})
        response.raise_for_status()
        return {**info(), **select_release(response.json(), filename=installer_name())}
