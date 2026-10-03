import json
import zipfile
from xml.etree import ElementTree as ET

import manifold3d as md
import numpy as np
import pytest
import trimesh
from shapely.geometry import LineString, box

import backend.export as exporter
from backend.config import Settings
from backend.geometry import as_trimesh, generate_solids

NS = {'m': exporter.CORE_NS, 'c': exporter.MATERIAL_NS}


def quiet(*args):
    pass


# Fixture coordinates remain independent of the workspace's starting location.
FIXTURE_BOUNDS = dict(west=-1.352, east=-1.278, south=53.498586, north=53.527414)


def settings(**changes):
    return Settings(name='Test terrain', bounds=FIXTURE_BOUNDS, width=200, height=100, printer_width=110, printer_height=110,
                    resolution=64, frame_mode='none', labels=False, joints=False,
                    roads='none', water=False, buildings=False, multicolour=True,
                    colour_buildings='#80a768', colour_forest='#385A39', colour_fields='#C5AF68', **changes)


def fixture_parts():
    first = md.Manifold.cube((100, 100, 4))
    second = first.translate((100, 0, 0))
    water = md.Manifold.cube((20, 20, 0.8)).translate((110, 10, 3.2))
    forest = md.Manifold.cube((10, 10, 0.8)).translate((150, 10, 3.2)) + md.Manifold.cube((10, 10, 0.8)).translate((170, 70, 3.2))
    fields = md.Manifold.cube((20, 20, 0.8)).translate((110, 60, 3.2))
    buildings = md.Manifold.cube((20, 20, 0.8)).translate((150, 40, 3.2))
    regions = {'ground': second - water - forest - fields - buildings,
               'water': water, 'forest': forest, 'fields': fields, 'buildings': buildings}
    return [
        {'id': 'A1', 'kind': 'terrain', 'solid': first, 'material_regions': {'ground': first}, 'neighbours': {}},
        {'id': 'A2', 'kind': 'terrain', 'solid': second, 'material_regions': regions, 'neighbours': {}},
    ]


def fixture_generator(*args):
    return fixture_parts(), {'columns': 2, 'rows': 1, 'joints': [], 'dem': {'provider': 'Test fixture'},
                             'osm': {'provider': 'Test fixture'}, 'features': {}, 'warnings': []}


def model_xml(path):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        return ET.fromstring(archive.read('3D/3dmodel.model'))


def mesh_xml(obj):
    vertices = [[float(v.attrib[k]) for k in ('x', 'y', 'z')] for v in obj.findall('m:mesh/m:vertices/m:vertex', NS)]
    faces = [[int(t.attrib[k]) for k in ('v1', 'v2', 'v3')] for t in obj.findall('m:mesh/m:triangles/m:triangle', NS)]
    return trimesh.Trimesh(vertices=vertices, faces=faces, process=False)


def test_multicolour_3mf_preserves_shared_origin_parts_and_assignments(tmp_path, monkeypatch):
    monkeypatch.setattr(exporter, 'generate_solids', fixture_generator)
    info = exporter.build_project(settings(), tmp_path, quiet)
    colour = info['multicolour']
    palette = {m['id']: m for m in colour['palette']}
    assert palette['ground']['filament'] == palette['buildings']['filament'] == 1
    assert len({m['filament'] for m in colour['palette']}) == 4
    tile = colour['tiles'][1]
    assert tile['part_id'] == 'A2'
    assert info['parts'][1]['assembly_origin_mm'] == [100, 0, 0]
    root = model_xml(tmp_path / tile['file'])
    bases = root.findall('m:resources/m:basematerials/m:base', NS)
    assert len(bases) == 4
    assert all(len(base.attrib['displaycolor']) == 9 for base in bases)
    colours = root.findall('m:resources/c:colorgroup/c:color', NS)
    assert [colour.attrib['color'] for colour in colours] == [base.attrib['displaycolor'] for base in bases]
    objects = {obj.attrib['id']: obj for obj in root.findall('m:resources/m:object', NS)}
    build = root.findall('m:build/m:item', NS)
    assert len(build) == 1
    parent = objects[build[0].attrib['objectid']]
    components = parent.findall('m:components/m:component', NS)
    assert len(components) == 5
    assert not parent.findall('m:mesh', NS)
    assert all('transform' not in c.attrib for c in components)
    volumes = []
    for component, material in zip(components, tile['materials']):
        obj = objects[component.attrib['objectid']]
        assert obj.attrib['pid'] == '1'
        assert int(obj.attrib['pindex']) == material['filament'] - 1
        for triangle in obj.findall('m:mesh/m:triangles/m:triangle', NS):
            assert triangle.attrib['pid'] == '2'
            assert all(int(triangle.attrib[k]) == material['filament'] - 1 for k in ('p1', 'p2', 'p3'))
        mesh = mesh_xml(obj)
        assert mesh.is_watertight and mesh.is_volume
        assert mesh.volume == pytest.approx(material['volume_mm3'], abs=0.001)
        volumes.append(mesh)
    assert sum(mesh.volume for mesh in volumes) == pytest.approx(100 * 100 * 4, abs=0.001)
    water = trimesh.load_mesh(tmp_path / next(m['file'] for m in tile['materials'] if m['id'] == 'water'))
    assert np.allclose(water.bounds[0], [10, 10, 3.2], atol=0.00001)
    forest = trimesh.load_mesh(tmp_path / next(m['file'] for m in tile['materials'] if m['id'] == 'forest'))
    assert len(forest.split()) == 2  # Named material volumes may contain islands.
    with zipfile.ZipFile(tmp_path / tile['file']) as archive:
        config = ET.fromstring(archive.read('Metadata/model_settings.config'))
        object_config = config.find('object')
        assert object_config.attrib['id'] == parent.attrib['id']
        part_assignments = object_config.findall('part')
        assert len(part_assignments) == len(components)
        for volume, material in zip(part_assignments, tile['materials']):
            assert volume.attrib['subtype'] == 'normal_part'
            assert volume.find("metadata[@key='extruder']").attrib['value'] == str(material['filament'])
        assert 'Metadata/project_settings.config' not in archive.namelist()
    manifest = json.loads((tmp_path / 'Multicolour/materials.json').read_text())
    assert manifest == colour
    assert any('AMS trays' in line for line in colour['instructions'])


def test_multicolour_pack_keeps_monochrome_files_and_semantic_preview(tmp_path, monkeypatch):
    monkeypatch.setattr(exporter, 'generate_solids', fixture_generator)
    info = exporter.build_project(settings(), tmp_path, quiet)
    for part in info['parts']:
        mesh = trimesh.load_mesh(tmp_path / part['file'])
        assert mesh.is_watertight and mesh.is_volume
        assert np.allclose(mesh.bounds[0], 0)
        assert 'material_regions' not in part
    assembly = model_xml(tmp_path / 'Assembly.3mf')
    assert len(assembly.findall('m:build/m:item', NS)) == 2
    scene = trimesh.load(tmp_path / 'preview.glb', force='scene')
    assert 'MaterialVisual_A2_water' in scene.graph.nodes_geometry
    assert 'MaterialVisual_A2_buildings' in scene.graph.nodes_geometry
    water = scene.geometry[scene.graph['MaterialVisual_A2_water'][1]]
    assert np.allclose(water.bounds[0], [110, 10, 3.2], atol=0.00001)
    with zipfile.ZipFile(tmp_path / 'project.zip') as archive:
        members = archive.namelist()
        for tile in info['multicolour']['tiles']:
            assert any(name.endswith(tile['file']) for name in members)
            for material in tile['materials']:
                assert any(name.endswith(material['file']) for name in members)
        assert any(name.endswith('Multicolour/readme.txt') for name in members)
        assert any(name.endswith('Multicolour/materials.json') for name in members)


@pytest.mark.parametrize('failure', ['missing', 'overlap', 'balanced'])
def test_invalid_material_partition_never_publishes_pack(tmp_path, monkeypatch, failure):
    def invalid(*args):
        parts, meta = fixture_generator()
        if failure == 'missing':
            del parts[1]['material_regions']['water']
        elif failure == 'overlap':
            parts[1]['material_regions']['water'] = parts[1]['solid']
        else:
            # Equal-volume duplication compensates for the missing water.
            # A total-volume-only check would incorrectly accept this pack.
            parts[1]['material_regions']['water'] = parts[1]['material_regions']['fields']
        return parts, meta
    monkeypatch.setattr(exporter, 'generate_solids', invalid)
    with pytest.raises(ValueError, match='cover|overlapping'):
        exporter.build_project(settings(), tmp_path, quiet)
    assert not (tmp_path / 'project.zip').exists()


@pytest.mark.parametrize('union_drift', [-0.0165254, 0.0165254, -0.08, 0.08])
def test_reunion_boundary_residue_has_a_bounded_symmetric_allowance(monkeypatch, union_drift):
    part = fixture_parts()[1]
    native_batch = md.Manifold.batch_boolean
    native_volume = md.Manifold.volume
    noisy_unions = []

    def batch_with_boundary_residue(solids, operation):
        combined = native_batch(solids, operation)
        noisy_unions.append(combined)
        return combined

    def volume_with_boundary_residue(solid):
        # Reproduce measured dense-city re-union residue without rerunning a
        # geographic model. Independent regions and coverage operations retain
        # their exact native volumes; only the re-union measurement drifts.
        return native_volume(solid) + (union_drift if any(solid is union for union in noisy_unions) else 0)

    monkeypatch.setattr(md.Manifold, 'batch_boolean', batch_with_boundary_residue)
    monkeypatch.setattr(md.Manifold, 'volume', volume_with_boundary_residue)
    if abs(union_drift) <= 0.04:  # One ppm of this 40,000 mm³ tile.
        assert exporter.validated_material_regions(part).keys() == part['material_regions'].keys()
    else:
        with pytest.raises(ValueError, match='cover|overlapping'):
            exporter.validated_material_regions(part)


def test_monochrome_export_does_not_add_material_files(tmp_path, monkeypatch):
    monkeypatch.setattr(exporter, 'generate_solids', fixture_generator)
    s = settings().model_copy(update={'multicolour': False})
    info = exporter.build_project(s, tmp_path, quiet)
    assert 'multicolour' not in info
    assert all('multicolour_file' not in part for part in info['parts'])
    with zipfile.ZipFile(tmp_path / 'project.zip') as archive:
        assert not any('/Materials/' in path or '/Multicolour/' in path for path in archive.namelist())


@pytest.mark.parametrize('material_only', [False, True])
def test_stl_reload_volume_change_never_publishes_pack(tmp_path, monkeypatch, material_only):
    monkeypatch.setattr(exporter, 'generate_solids', fixture_generator)
    native_load = trimesh.load_mesh

    def load_with_volume_drift(path, *args, **kwargs):
        mesh = native_load(path, *args, **kwargs)
        if not material_only or 'Materials' in str(path):
            # Still closed, positively oriented geometry: topology alone must
            # not accept a representation outside its native solid's limit.
            mesh.apply_scale(1.01)
        return mesh

    monkeypatch.setattr(trimesh, 'load_mesh', load_with_volume_drift)
    with pytest.raises(ValueError, match='round-trip'):
        exporter.build_project(settings(), tmp_path, quiet)
    assert not (tmp_path / 'project.zip').exists()


@pytest.mark.parametrize('frame_mode', ['integrated', 'separate', 'none'])
@pytest.mark.parametrize('terrain_style', ['smooth', 'sculpted', 'faceted', 'terraced'])
def test_actual_terrain_materials_export_for_every_frame_mode(tmp_path, frame_mode, terrain_style):
    def source(xs, ys, geo):
        dem = np.add.outer(np.sin(ys / 8) * 10, np.cos(xs / 7) * 9)
        return dem, [('forest', box(5, 5, 55, 95), {}), ('field', box(65, 5, 115, 95), {}),
                     ('water', LineString([(5, 50), (115, 50)]), {}),
                     ('road', LineString([(60, 5), (60, 95)]), {}),
                     ('building', box(75, 20, 85, 30), {'height': '8'})]
    s = Settings(name='Test terrain', bounds=FIXTURE_BOUNDS, width=120, height=100, resolution=64, frame_mode=frame_mode,
                 layout='manual', columns=2, rows=1, forests=True, fields=True, multicolour=True, terrain_style=terrain_style,
                 colour_ground='#D9D3B9', colour_fields='#D9D3B9', colour_roads='#D9D3B9',
                 colour_buildings='#D9D3B9', colour_markers='#2B4045')
    info = exporter.build_project(s, tmp_path, quiet, source)
    assert len({m['filament'] for m in info['multicolour']['palette']}) <= 4
    assert len(info['multicolour']['tiles']) == len([p for p in info['parts'] if p['kind'] in ('terrain', 'frame')])
    for tile in info['multicolour']['tiles']:
        root = model_xml(tmp_path / tile['file'])
        assert len(root.findall('m:build/m:item', NS)) == 1
        for material in tile['materials']:
            mesh = trimesh.load_mesh(tmp_path / material['file'])
            assert mesh.is_watertight and mesh.is_volume


@pytest.mark.parametrize('terrain_style', ['smooth', 'sculpted', 'faceted', 'terraced'])
@pytest.mark.parametrize('depth', [.4, .8, 2])
def test_hill_colour_stays_near_surface_and_preserves_complete_solid(terrain_style, depth):
    s = Settings(width=120, height=100, resolution=64, frame_mode='none', labels=False, joints=False,
                 roads='none', water=False, buildings=False, multicolour=True, smoothing=0,
                 terrain_style=terrain_style, colour_depth=depth)
    def hillside(xs, ys, geo):
        dem = np.tile(xs * .1 / (geo.scale * s.exaggeration), (len(ys), 1))
        return dem, [('forest', box(-1, -1, 121, 101), {})]
    parts, _ = generate_solids(s, quiet, hillside)
    part = parts[0]
    regions = exporter.validated_material_regions(part, stl_origin=np.zeros(3))
    forest = regions['forest']
    # A flat core would bury roughly 6 mm of colour on this 12 mm hill.
    # Terrace risers need a lateral shell as well as their coloured shelves.
    assert part['colour_core'] == 'surface-following'
    assert forest.volume() < s.width * s.height * (depth + 1)
    assert forest.slice(1.8).is_empty()
    assert forest.slice(4).area() < s.width * s.height * .25
    monochrome, _ = generate_solids(s.model_copy(update={'multicolour': False}), quiet, hillside)
    assert part['solid'].volume() == pytest.approx(monochrome[0]['solid'].volume(), abs=.001)


@pytest.mark.parametrize('water_style', ['carved', 'smooth'])
@pytest.mark.parametrize('roads', ['raised', 'engraved'])
def test_surface_colour_exports_recesses_banks_and_equal_depths(tmp_path, water_style, roads):
    s = Settings(width=120, height=100, resolution=64, frame_mode='none', labels=False, joints=False,
                 multicolour=True, water_style=water_style, water_bank=1, roads=roads,
                 road_height=.8, water_depth=.8, colour_depth=.8)
    def crossing(xs, ys, geo):
        dem = np.add.outer(np.sin(ys / 8) * 10, np.cos(xs / 7) * 9)
        return dem, [('forest', box(5, 5, 115, 95), {}),
                     ('water', LineString([(-5, 50), (125, 50)]), {}),
                     ('road', LineString([(60, -5), (60, 105)]), {})]
    info = exporter.build_project(s, tmp_path, quiet, crossing)
    assert info['parts'][0]['watertight']


def test_unrepresentable_surface_colour_uses_validated_level_core(monkeypatch):
    import backend.geometry as geometry
    convert = geometry.as_trimesh
    failed = False
    def reject_once(solid, **kwargs):
        nonlocal failed
        if kwargs.get('ensure_stl') and not failed:
            failed = True
            raise ValueError('Injected binary STL precision failure')
        return convert(solid, **kwargs)
    monkeypatch.setattr(geometry, 'as_trimesh', reject_once)
    s = Settings(width=120, height=100, resolution=64, frame_mode='none', labels=False, joints=False,
                 roads='none', water=False, buildings=False, multicolour=True)
    def flat(xs, ys, geo):
        return np.zeros((len(ys), len(xs))), [('forest', box(10, 10, 110, 90), {})]
    parts, meta = generate_solids(s, quiet, flat)
    assert parts[0]['colour_core'] == 'level-fallback'
    assert any('Tile A1 uses a deeper, level colour core' in warning for warning in meta['warnings'])
    exporter.validated_material_regions(parts[0], stl_origin=np.zeros(3))
