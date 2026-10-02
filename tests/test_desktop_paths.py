"""Regression checks for writable desktop data and frozen worker entry points."""
import json
import sys
from pathlib import Path
from backend import paths
from backend.config import Settings


def test_browser_preset_matches_backend():
    preset = json.loads((Path(__file__).resolve().parents[1] / 'src' / 'preset.json').read_text(encoding='utf-8'))
    assert preset == Settings().model_dump()


def test_packaged_worker_is_next_to_executable(monkeypatch, tmp_path):
    executable = tmp_path / 'Contour Studio'
    engine = tmp_path / ('ContourEngine.exe' if sys.platform == 'win32' else 'ContourEngine')
    engine.touch()
    monkeypatch.setattr(sys, 'frozen', True, raising=False)
    monkeypatch.setattr(sys, 'executable', str(executable))
    assert paths.worker_command('backend.worker', 'project') == [str(engine), 'backend.worker', 'project']


def test_desktop_data_override_does_not_write_to_bundle(monkeypatch, tmp_path):
    monkeypatch.setenv('CONTOUR_DATA_DIR', str(tmp_path))
    assert paths.user_data_root() == tmp_path.resolve()
