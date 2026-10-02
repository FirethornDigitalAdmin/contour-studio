"""Printable source contacts from the real City of London failure."""
import numpy as np
import pytest
import trimesh
from shapely.geometry import box

from backend.config import Settings
from backend.geometry import as_trimesh, clean_mesh_faces, label_tile, printable_footprint, prism, short_edge_clusters, text_shape


def stl_roundtrip(solid):
    mesh=as_trimesh(solid)
    assert mesh.is_volume and mesh.is_watertight
    # STL stores coordinates as float32 and readers weld shared positions.
    exported=trimesh.Trimesh(mesh.vertices.astype(np.float32),mesh.faces,process=True)
    assert exported.is_volume and exported.is_watertight
    return mesh


@pytest.mark.parametrize('size',[2.4,4.2])
def test_london_glyph_point_contact_is_a_printable_overlap(size):
    stl_roundtrip(prism(text_shape('CITY OF LONDON',72,size),.5,.25))


def test_london_rear_label_at_real_tile_coordinates():
    settings=Settings(name='City of London')
    bounds=(200,400,400,600)
    solid=label_tile(prism(box(*bounds),4),settings,'A2',bounds,
                     {'north':None,'east':'A3','south':'B2','west':'A1'})
    stl_roundtrip(solid)


def test_rear_lettering_starts_on_the_print_bed():
    bounds=(0,0,100,100)
    solid=label_tile(prism(box(*bounds),4),Settings(name='Home'),'A1',bounds,{})
    # Both slices lie inside the rear recess. Every letter must exist on
    # the first layer, rather than appearing above an empty bed region.
    first=solid.slice(.1)
    later=solid.slice(.3)
    assert first.area()==pytest.approx(later.area(),abs=1e-7)
    assert (first-later).area()==pytest.approx(0,abs=1e-7)
    assert (later-first).area()==pytest.approx(0,abs=1e-7)
    stl_roundtrip(solid)


def test_snapped_building_corner_contacts_have_finite_overlap():
    left=printable_footprint(box(300,490,307.001,495.001))
    right=printable_footprint(box(307.002,495.002,310,498))
    assert left.intersection(right).area>0
    stl_roundtrip(prism(box(298,488,312,500),4)+prism(left,12)+prism(right,15))


def test_cleanup_collapses_only_the_short_edge_of_a_zero_area_facet():
    mesh=trimesh.creation.box()
    a,b,c=mesh.faces[0]
    extra=len(mesh.vertices)
    vertices=np.vstack([mesh.vertices,mesh.vertices[a]+(mesh.vertices[b]-mesh.vertices[a])*1e-6])
    faces=np.vstack([mesh.faces[1:],[a,extra,c],[extra,b,c],[b,extra,a]])
    mesh=trimesh.Trimesh(vertices,faces,process=False)
    assert mesh.is_volume and np.any(mesh.area_faces==0)
    clean_mesh_faces(mesh)
    assert mesh.is_volume and mesh.is_watertight
    assert len(mesh.faces)==12 and np.all(mesh.area_faces>0)
    assert mesh.volume==pytest.approx(1,abs=1e-12)


def test_cleanup_retains_a_necessary_nonzero_thin_triangle():
    mesh=trimesh.creation.box()
    a,b,c=mesh.faces[0]
    extra=len(mesh.vertices)
    midpoint=(mesh.vertices[a]+mesh.vertices[b])/2
    vertices=np.vstack([mesh.vertices,midpoint+(mesh.vertices[c]-midpoint)*1e-9])
    faces=np.vstack([mesh.faces[1:],[a,b,extra],[b,c,extra],[c,a,extra]])
    mesh=trimesh.Trimesh(vertices,faces,process=False)
    assert mesh.is_volume and 0<mesh.area_faces.min()<1e-8
    broad=mesh.copy(); broad.process(validate=True)
    assert not broad.is_watertight
    clean_mesh_faces(mesh)
    assert mesh.is_volume and mesh.is_watertight and len(mesh.faces)==14
    assert mesh.volume==pytest.approx(1,abs=1e-12)


@pytest.mark.parametrize('edges',[[[1,2],[0,1]],[[0,1],[1,2]]])
def test_collapse_chains_cannot_move_an_older_member_beyond_tolerance(edges):
    vertices=np.array([[0,0,0],[.00009,0,0],[.00018,0,0]])
    parents=short_edge_clusters(vertices,edges)
    assert np.all(np.linalg.norm(vertices-vertices[parents],axis=1)<=.0001)
    assert len(np.unique(parents))==2
