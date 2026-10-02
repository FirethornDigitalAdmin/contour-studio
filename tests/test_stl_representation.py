"""Local float32 eligibility and the original native-volume repair limit."""
from types import SimpleNamespace

import numpy as np
import pytest
import trimesh

from backend.geometry import as_trimesh, clean_mesh_faces


class RecordedSolid:
    """Replay mesh conversion without an expensive geographic generation."""
    def __init__(self, mesh, simplified=None, native_volume=None):
        self.mesh = mesh
        self.simplified = simplified
        self.native_volume = mesh.volume if native_volume is None else native_volume
        self.repairs = []

    def volume(self):
        return self.native_volume

    def to_mesh64(self):
        return SimpleNamespace(vert_properties=self.mesh.vertices, tri_verts=self.mesh.faces)

    def as_original(self):
        return self

    def simplify(self, tolerance):
        self.repairs.append(tolerance)
        return RecordedSolid(self.simplified, native_volume=self.native_volume) if self.simplified is not None else self


def thin_material(width=0.000002):
    mesh = trimesh.creation.box((width, 1, 1))
    mesh.apply_translation((100 + width / 2, 50.5, 3.7))
    return mesh


def test_representable_raw_mesh_needs_no_native_simplification():
    mesh = trimesh.creation.box((100, 100, 4))
    mesh.apply_translation((50, 250, 2))
    solid = RecordedSolid(mesh)
    exported = as_trimesh(solid, ensure_stl=True)
    assert solid.repairs == []
    assert exported.is_volume and np.array_equal(exported.vertices, mesh.vertices)


def test_material_uses_parent_origin_even_when_its_own_origin_would_work():
    solid = RecordedSolid(thin_material())
    assert as_trimesh(solid, ensure_stl=True).is_volume
    assert solid.repairs == []
    # At the parent origin these two x positions alias in binary STL. Moving
    # this skin independently would conceal that failure and lose alignment.
    with pytest.raises(ValueError, match='representable'):
        as_trimesh(solid, ensure_stl=True, stl_origin=[0, 0, 0])
    assert solid.repairs == [0.0001]


def test_local_stl_failure_uses_only_the_bounded_simplification():
    solid = RecordedSolid(thin_material(), simplified=thin_material(0.00002))
    repaired = as_trimesh(solid, ensure_stl=True, stl_origin=[0, 0, 0])
    assert solid.repairs == [0.0001]
    local = repaired.copy()
    local.vertices = local.vertices.astype(np.float32).astype(np.float64)
    clean_mesh_faces(local)
    assert local.is_volume and local.is_watertight
    assert abs(local.volume - solid.volume()) <= 0.001


def test_local_stl_repair_cannot_exceed_original_native_volume_limit():
    solid = RecordedSolid(thin_material(), simplified=thin_material(0.002))
    with pytest.raises(ValueError, match='representable|volume change'):
        as_trimesh(solid, ensure_stl=True, stl_origin=[0, 0, 0])
    assert solid.repairs == [0.0001]
