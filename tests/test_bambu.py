import json
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from fastapi.testclient import TestClient
import pytest
import trimesh

import backend.app as server
from backend.bambu import arrange, prepare_project
from backend.export import CORE_NS


def fixture(root):
    parts = []
    for ident, kind, size, quantity in [('A1', 'terrain', (100, 100, 4), 1), ('A2', 'terrain', (100, 100, 4), 1),
                                        ('Joining_key', 'key', (10, 4, 2), 12), ('Fit_Left', 'coupon', (12, 20, 4), 1)]:
        mesh = trimesh.creation.box(extents=size)
        mesh.apply_translation(mesh.extents / 2)
        mesh.export(root / f'{ident}.stl')
        parts.append(dict(id=ident, kind=kind, dimensions_mm=list(size), file=f'{ident}.stl', quantity=quantity))
    return dict(name='Fixture', created_at='2026-10-03', layout=dict(columns=2, rows=1), parts=parts,
                settings=dict(printer_width=110, printer_height=110, printer_z=110, margin=5))


def test_all_copies_fit_without_overlap_and_roundtrip_metadata(tmp_path):
    info = fixture(tmp_path)
    plates = arrange(info)
    assert len(plates) == 4
    assert sum(len(p['items']) for p in plates) == 15
    for plate in plates:
        for i, a in enumerate(plate['items']):
            w, h, _ = a['part']['dimensions_mm']
            assert 5 <= a['x'] <= 105 - w
            assert 5 <= a['y'] <= 105 - h
            for b in plate['items'][i+1:]:
                bw, bh, _ = b['part']['dimensions_mm']
                assert a['x'] + w <= b['x'] or b['x'] + bw <= a['x'] or a['y'] + h <= b['y'] or b['y'] + bh <= a['y']
    manifest = prepare_project(tmp_path, info)
    with zipfile.ZipFile(tmp_path / manifest['files'][0]) as z:
        assert z.testzip() is None
        config = ET.fromstring(z.read('Metadata/model_settings.config'))
        assert len(config.findall('plate')) == 4
        assert len(config.findall('plate/model_instance')) == 15
        model = ET.fromstring(z.read('3D/3dmodel.model'))
        assert len(model.findall(f'{{{CORE_NS}}}build/{{{CORE_NS}}}item')) == 15
        settings = json.loads(z.read('Metadata/project_settings.config'))
        assert len(settings['inherits_group']) == len(settings['filament_colour']) + 2


def test_large_projects_split_at_studio_plate_limit(tmp_path):
    info = fixture(tmp_path)
    info['parts'] = [{**info['parts'][0], 'quantity': 37}]
    manifest = prepare_project(tmp_path, info)
    assert manifest['plate_count'] == 37
    assert len(manifest['files']) == 2
    counts = []
    for file in manifest['files']:
        with zipfile.ZipFile(tmp_path / file) as z:
            counts.append(len(ET.fromstring(z.read('Metadata/model_settings.config')).findall('plate')))
    assert counts == [36, 1]


def test_endpoint_prepares_legacy_pack_and_launches_only_on_request(tmp_path, monkeypatch):
    root = tmp_path / 'test'; root.mkdir()
    info = fixture(root)
    (root / 'model-info.json').write_text(json.dumps(info))
    with zipfile.ZipFile(root / 'project.zip', 'w') as z: z.writestr('fixture', '')
    monkeypatch.setattr(server, 'OUTPUT', tmp_path)
    launches = []
    monkeypatch.setattr('backend.bambu.launch_projects', lambda paths: launches.append(paths))
    with TestClient(server.app) as client:
        path = '/api/projects/test/bambu'
        assert client.post(path, headers={'origin': 'https://example.com'}).status_code == 403
        assert client.post('/api/projects/missing/bambu').status_code == 409
        assert client.post(path).json()['piece_count'] == 15
        assert not launches
        assert client.post(path+'?launch=true').status_code == 200
        assert len(launches) == 1
        assert launches[0][0] == root / 'Bambu/Print-plates-1.3mf'


def test_l_shaped_borders_share_a_plate_with_true_clearance(tmp_path):
    import manifold3d as md
    from backend.geometry import as_trimesh
    shape = md.Manifold.cube((90, 3, 4)) + md.Manifold.cube((3, 60, 4))
    first = as_trimesh(shape)
    second = first.copy()
    second.apply_transform(trimesh.transformations.rotation_matrix(3.141592653589793, [0, 0, 1]))
    second.apply_translation(-second.bounds[0])
    parts = []
    for name, mesh in [('Frame_1', first), ('Frame_2', second)]:
        mesh.export(tmp_path / f'{name}.stl')
        parts.append(dict(id=name, kind='frame', dimensions_mm=mesh.extents.tolist(), file=f'{name}.stl'))
    info = dict(parts=parts, settings=dict(printer_width=110, printer_height=110, printer_z=100, margin=5))
    plates = arrange(info, tmp_path)
    assert len(plates) == 1
    assert len(plates[0]['items']) == 2
    a, b = plates[0]['footprints']
    assert a.distance(b) >= 3.999
    for footprint in (a, b):
        x0, y0, x1, y1 = footprint.bounds
        assert x0 >= -.001 and y0 >= -.001 and x1 <= 100.01 and y1 <= 100.01
    manifest = prepare_project(tmp_path, info)
    with zipfile.ZipFile(tmp_path / manifest['files'][0]) as archive:
        config = ET.fromstring(archive.read('Metadata/model_settings.config'))
        assert len(config.findall('plate/model_instance')) == 2
        assert len(config.findall('plate')) == 1
