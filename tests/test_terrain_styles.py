import json

import numpy as np
import pytest
import trimesh
from shapely.geometry import LineString, box

from backend.config import Settings
from backend.export import build_project
from backend.geometry import as_trimesh, generate_solids, style_terrain, terraced_solid, union


STYLES = ['smooth', 'terraced', 'sculpted', 'faceted']


def hills(xs, ys, geo):
    dem = 120 * np.exp(-((xs[None, :] - 64)**2 + (ys[:, None] - 49)**2) / 1700)
    return dem, [('road', LineString([(5, 10), (115, 70)]), {}),
                 ('water', LineString([(5, 60), (115, 20)]), {}),
                 ('building', box(57, 35, 63, 45), {'height': '12'})]


def quiet(*args):
    pass


def settings(**updates):
    return Settings(width=120, height=80, resolution=64, frame_mode='none',
                    labels=False, joints=False, exaggeration=6, **updates)


def test_old_settings_keep_smooth_surface_and_validate_new_controls():
    old = Settings().model_dump(exclude={'terrain_style', 'contour_height', 'facet_size'})
    assert Settings(**old).terrain_style == 'smooth'
    for change in [dict(terrain_style='unknown'), dict(contour_height=0), dict(facet_size=100)]:
        with pytest.raises(ValueError):
            Settings(**change)


def test_styles_change_surface_with_flat_shelves_and_coarse_facets():
    xs, ys = np.linspace(0, 120, 65), np.linspace(0, 80, 44)
    relief = np.add.outer(ys / 12, xs / 13)
    outputs = {}
    for style in STYLES:
        x, y, z = style_terrain(xs, ys, relief, settings(terrain_style=style))
        assert z.shape == (len(y), len(x))
        assert z.min() >= 0
        outputs[style] = z
    assert np.array_equal(outputs['smooth'], relief)
    np.testing.assert_allclose(outputs['terraced'] / 1.2, np.floor(relief / 1.2))
    assert not np.allclose(outputs['sculpted'], relief)
    assert not np.allclose(outputs['sculpted'], outputs['terraced'])
    assert outputs['faceted'].size < relief.size / 10
    for style in STYLES:
        _, _, flat = style_terrain(xs, ys, np.zeros_like(relief), settings(terrain_style=style))
        assert np.count_nonzero(flat) == 0


@pytest.mark.parametrize('style', STYLES)
def test_styled_exports_preserve_base_features_and_saved_choice(style, tmp_path):
    s = settings(terrain_style=style, contour_height=0.8, facet_size=16)
    info = build_project(s, tmp_path, quiet, hills)
    mesh = trimesh.load_mesh(tmp_path / info['parts'][0]['file'])
    assert mesh.is_volume and mesh.is_watertight
    assert len(mesh.split()) == 1
    assert info['model']['features']['roads'] == 1
    assert info['model']['features']['water'] == 1
    assert info['model']['features']['buildings'] == 1
    # Top surfaces remain above the reserved minimum base after carving.
    # Vertical walls may contain triangulation vertices between the bed and
    # base height; those vertices do not describe the thickness of the top.
    top_faces = mesh.faces[mesh.face_normals[:, 2] > 1e-5]
    assert len(top_faces) > 0
    top_vertices = mesh.vertices[np.unique(top_faces)]
    assert top_vertices[:, 2].min() >= s.base - 0.001
    saved = json.loads((tmp_path / 'settings.json').read_text())
    assert saved['terrain_style'] == style
    assert saved['contour_height'] == 0.8
    assert saved['facet_size'] == 16
    assert (tmp_path / 'preview.glb').is_file()


@pytest.mark.parametrize('style', STYLES[1:])
def test_styled_terrain_matches_across_tile_seams(style):
    s = settings(terrain_style=style, layout='manual', columns=2, rows=1)
    parts, meta = generate_solids(s, quiet, hills)
    rebuilt = union([p['solid'] for p in parts])
    assert rebuilt.volume() == pytest.approx(meta['whole_volume_mm3'], abs=0.001)
    whole, _ = generate_solids(s.model_copy(update={'columns': 1}), quiet, hills)
    assert (rebuilt - whole[0]['solid']).volume() < 0.001
    assert (whole[0]['solid'] - rebuilt).volume() < 0.001
    for part in parts:
        assert as_trimesh(part['solid']).is_volume


@pytest.mark.parametrize('style', STYLES[1:])
@pytest.mark.parametrize('frame_mode', ['integrated', 'separate'])
def test_styles_with_frames_labels_and_joining_keys(style, frame_mode):
    s = settings(terrain_style=style, layout='manual', columns=2, rows=1)
    s = s.model_copy(update={'frame_mode': frame_mode, 'labels': True, 'joints': True})
    parts, _ = generate_solids(s, quiet, hills)
    for part in parts:
        mesh = as_trimesh(part['solid'])
        assert mesh.is_volume and mesh.is_watertight, part['id']
        assert len(mesh.split()) == 1, part['id']


def test_terraces_have_flat_shelves_and_interpolated_walls_not_grid_ramps():
    axis = np.linspace(0, 60, 9)
    relief = np.add.outer(axis*.07, axis*.1)
    mesh = as_trimesh(terraced_solid(axis, axis, relief, base=4, step=1.3))
    assert mesh.is_volume and len(mesh.split()) == 1
    # Every face is either a flat shelf/base or a vertical contour wall.
    nz = np.abs(mesh.face_normals[:, 2])
    assert np.all(np.isclose(nz, 0) | np.isclose(nz, 1))
    xy = mesh.vertices[:, :2]
    # The curves cross BETWEEN grid nodes; they do not follow pixel boundaries.
    assert np.any(~np.isclose(xy / 7.5, np.round(xy / 7.5)))


def test_higher_quality_contours_converge_to_the_true_curve():
    errors = []
    for samples in [12, 96]:
        axis = np.linspace(-25, 25, samples+1)
        radius_squared = axis[:, None]**2 + axis[None, :]**2
        relief = 2*np.exp(-radius_squared/200)
        mesh = as_trimesh(terraced_solid(axis, axis, relief, base=4, step=1.1))
        top = mesh.vertices[np.isclose(mesh.vertices[:, 2], 5.1), :2]
        true_radius = np.sqrt(-200*np.log(1.1/2))
        errors.append(np.max(np.abs(np.linalg.norm(top, axis=1)-true_radius)))
    assert errors[1] < errors[0]/10
    assert errors[1] < .01


def test_contour_holes_and_boundary_clipping_are_preserved():
    axis = np.linspace(-25, 25, 97)
    radius = np.sqrt(axis[:, None]**2 + axis[None, :]**2)
    relief = np.maximum(0, 2-np.abs(radius-15)/5)
    solid = terraced_solid(axis, axis, relief, base=4, step=1.5)
    # A ring-shaped hill must retain its central depression above the base.
    assert solid.slice(5).area() == pytest.approx(np.pi*(17.5**2-12.5**2), rel=.01)
    assert as_trimesh(solid).is_volume
    clipped = terraced_solid(axis[48:], axis, relief[:, 48:], base=4, step=1.5)
    assert clipped.slice(5).area() == pytest.approx(solid.slice(5).area()/2, rel=.001)
    assert as_trimesh(clipped).is_volume
