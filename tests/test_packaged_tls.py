import os
import certifi
from backend import paths


def test_frozen_helpers_use_bundled_trust_store(monkeypatch):
    monkeypatch.setattr(paths.sys, 'frozen', True, raising=False)
    monkeypatch.delenv('SSL_CERT_FILE', raising=False)
    paths.configure_packaged_tls()
    assert os.environ['SSL_CERT_FILE'] == certifi.where()
    assert paths.Path(os.environ['SSL_CERT_FILE']).is_file()


def test_explicit_trust_store_is_preserved(monkeypatch):
    monkeypatch.setattr(paths.sys, 'frozen', True, raising=False)
    monkeypatch.setenv('SSL_CERT_FILE', '/custom/trusted-ca.pem')
    paths.configure_packaged_tls()
    assert os.environ['SSL_CERT_FILE'] == '/custom/trusted-ca.pem'
