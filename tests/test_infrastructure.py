"""Physical/export regressions for new mapped transport and city relief."""
import io
import numpy as np
import pytest
import trimesh
from shapely.geometry import LineString, box
from backend.config import Settings
from backend.geometry import generate_solids, as_trimesh, union, clean_mesh_faces, prism
from backend.infrastructure import road_width, railway_plan, bridge_opening_plan, bridge_arch_profile
from backend.overpass import selectors
from backend.export import build_project


def quiet(*args): pass


def settings(**changes):
    return Settings(width=120,height=100,resolution=64,frame_mode='none',joints=False,labels=False,
                    railways=True,urban_spaces=True,road_hierarchy=True,supported_crossings=True,
                    preserve_building_gaps=True,building_type_heights=True,**changes)


def source(xs,ys,geo):
    return np.add.outer(ys*.6,xs*.15),[
        ('railway',LineString([(5,20),(115,20)]),{'railway':'rail'}),
        ('railway',LineString([(5,50),(115,50)]),{'railway':'rail','bridge':'yes'}),
        ('railway',LineString([(5,70),(115,70)]),{'railway':'rail','tunnel':'yes'}),
        ('railway',box(15,22,30,25),{'railway':'platform'}),
        ('road',LineString([(60,5),(60,95)]),{'highway':'primary','bridge':'yes'}),
        ('road',LineString([(80,5),(80,95)]),{'highway':'residential','tunnel':'yes'}),
        ('water',LineString([(5,55),(115,55)]),{}),
        ('park',box(5,75,35,95),{}),('hardscape',box(85,75,115,95),{}),
        ('building',box(40,30,40.6,34),{'building':'house'}),
        ('building',box(41,30,41.6,34),{'building':'house'}),
        ('building',box(90,30,100,40),{'building':'apartments'}),
    ]


def test_data_selection_and_physical_widths():
    s=settings(nozzle=1)
    assert any('railway' in f for f in selectors(s))
    assert any('leisure' in f for f in selectors(s))
    assert road_width({'highway':'motorway'},s,.1)>road_width({'highway':'footway'},s,.1)>=2
    assert road_width({'width':'nan'},s,.1)>=2
    for value in [dict(railway_height=0),dict(railway_width=9),dict(railway_style='floating')]:
        with pytest.raises(ValueError): Settings(**value)


def test_real_gauge_controls_track_detail_and_tunnels_are_hidden():
    f=[('railway',LineString([(5,20),(100,20)]),{'railway':'rail'}),
       ('railway',LineString([(5,40),(100,40)]),{'railway':'rail','tunnel':'yes'})]
    for scale,detailed in [(.01,False),(2,True)]:
        bed,detail,_,counts=railway_plan(f,settings(railway_width=5),scale,box(0,0,120,100))
        assert counts['railways']==1
        assert bool(counts['rail_detail_lines'])==detailed
        assert (not detail.is_empty)==detailed
        assert not bed.intersects(box(0,38,120,42))
        assert counts['sleepers']<=1200


@pytest.mark.parametrize('multicolour',[False,True])
@pytest.mark.parametrize('terrain_style',['smooth','terraced','faceted'])
def test_supported_transport_city_relief_survives_binary_stl(multicolour,terrain_style):
    s=settings(multicolour=multicolour,terrain_style=terrain_style,layout='manual',columns=2,rows=1)
    parts,meta=generate_solids(s,quiet,source)
    features=meta['features']
    assert features['railways']==2 and features['platforms']==1
    assert features['omitted_tunnel_roads']==1 and features['supported_crossings']==2
    assert features['gap_preserved_buildings']==2 and features['omitted_small_buildings']==2
    assert features['type_height_estimates']==1
    for part in parts:
        mesh=as_trimesh(part['solid'],ensure_stl=True)
        mesh.apply_translation(-mesh.bounds[0])
        mesh.vertices=mesh.vertices.astype(np.float32).astype(np.float64)
        clean_mesh_faces(mesh)
        reloaded=trimesh.load_mesh(io.BytesIO(mesh.export(file_type='stl')),file_type='stl')
        assert reloaded.is_volume and len(reloaded.split())==1
        assert reloaded.bounds[1,2]<=s.printer_z
        if multicolour:
            regions=part['material_regions']
            assert {'roads','ground'}<=regions.keys()
            assert sum(r.volume() for r in regions.values())==pytest.approx(part['solid'].volume(),abs=.001)
            assert union(list(regions.values())).volume()==pytest.approx(part['solid'].volume(),abs=.001)
            for r in regions.values():
                rm=as_trimesh(r,ensure_stl=True)
                rm.apply_translation(-rm.bounds[0])
                rm.vertices=rm.vertices.astype(np.float32).astype(np.float64)
                clean_mesh_faces(rm)
                m=trimesh.load_mesh(io.BytesIO(rm.export(file_type='stl')),file_type='stl')
                assert m.is_volume


def test_production_multicolour_pack(tmp_path):
    info=build_project(settings(multicolour=True,layout='manual',columns=2,rows=1),tmp_path,quiet,source)
    assert info['model']['features']['parks']==1
    for tile in info['multicolour']['tiles']:
        for material in tile['materials']:
            assert trimesh.load_mesh(tmp_path/material['file']).is_volume


def test_close_selection_detailed_tracks_export_without_supports(tmp_path):
    def curved(xs,ys,geo):
        return np.add.outer(ys*.2,xs*.1), [('railway',LineString([(10,20),(45,25),(70,50),(110,55)]),{'railway':'rail'})]
    s=settings(bounds=dict(west=0,east=.0004,south=0,north=.0003),railway_width=8,exaggeration=.2,water=False,roads='none',multicolour=True)
    info=build_project(s,tmp_path,quiet,curved)
    assert info['model']['features']['rail_detail_lines']==1
    assert info['model']['features']['sleepers']>0


@pytest.mark.parametrize('kind,tags', [
    ('road', {'highway':'footway','bridge':'yes'}),
    ('railway', {'railway':'rail','bridge':'viaduct'}),
])
@pytest.mark.parametrize('roads', ['raised', 'engraved'])
def test_bridge_over_water_is_filled_to_base_and_toggle_removes_deck(kind,tags,roads):
    def crossing(xs,ys,geo):
        return np.zeros((len(ys),len(xs))), [
            (kind,LineString([(10,50),(110,50)]),tags),
            ('water',box(45,10,75,90),{'natural':'water'}),
        ]
    s=settings(roads=roads,water_depth=2,water_bank=1,buildings=False,bridge_openings=False)
    # A column inside the crossing includes the river cavity and the deck.
    # A watertight mesh alone would also accept an unsupported roof over water.
    probe=prism(box(58,49.8,62,50.2),s.base+s.water_depth+.1)
    for enabled in (True,False):
        parts,meta=generate_solids(s.model_copy(update={'supported_crossings':enabled}),quiet,crossing)
        solid=union([part['solid'] for part in parts])
        assert meta['features']['supported_crossings']==int(enabled)
        if enabled:
            assert (probe-solid).volume()==pytest.approx(0,abs=1e-6)
            mesh=trimesh.load_mesh(io.BytesIO(as_trimesh(solid,ensure_stl=True).export(file_type='stl')),file_type='stl')
            assert mesh.is_volume and len(mesh.split())==1
        else:
            assert (probe-solid).volume()>1


@pytest.mark.parametrize('mapped', [True,False])
@pytest.mark.parametrize('kind,tags', [
    ('road', {'highway':'primary','bridge':'yes'}),
    ('railway', {'railway':'rail','bridge':'viaduct'}),
])
def test_curved_opening_is_through_with_thick_roof_and_printable_stl(mapped,kind,tags):
    def crossing(xs,ys,geo):
        features=[(kind,LineString([(10,50),(110,50)]),tags)]
        if mapped: features.append(('water',box(70,10,80,90),{'natural':'water'}))
        return np.zeros((len(ys),len(xs))),features
    s=settings(buildings=False,water_depth=2,bridge_openings=True)
    parts,meta=generate_solids(s,quiet,crossing)
    assert meta['features']['bridge_openings']==1
    assert meta['features']['inferred_bridge_openings']==int(not mapped)
    solid=union([part['solid'] for part in parts])
    x=75 if mapped else 60
    floor=s.base+(0 if mapped else s.water_depth)+.05
    # The low centre of the opening must be empty THROUGH both mouths.
    air=prism(box(x-.1,47,x+.1,53),.3,floor+.1)
    assert (solid^air).volume()==pytest.approx(0,abs=1e-6)
    # The curved crown retains at least two nozzle widths of solid roof.
    arch_height=max(y for _,y in bridge_arch_profile(4))
    roof=prism(box(x-.1,49.8,x+.1,50.2),.6,floor+arch_height+.1)
    assert (roof-solid).volume()==pytest.approx(0,abs=1e-6)
    base=prism(box(x-.1,49.8,x+.1,50.2),s.base)
    assert (base-solid).volume()==pytest.approx(0,abs=1e-6)
    mesh=trimesh.load_mesh(io.BytesIO(as_trimesh(solid,ensure_stl=True).export(file_type='stl')),file_type='stl')
    assert mesh.is_volume and len(mesh.split())==1
    # The rounded crown is deliberately shallow, but its entire region
    # below 45 degrees is short enough for miniature bridging (<3 mm).
    roof_faces=(mesh.triangles_center[:,2]>floor+.01)&(mesh.face_normals[:,2]<-1e-4)
    assert roof_faces.any()
    slopes=np.abs(mesh.face_normals[roof_faces,2])
    assert slopes.max()>.99
    assert np.ptp(slopes)>.4  # genuinely curved, rather than two flat slopes
    crown=mesh.triangles[roof_faces][slopes>np.sqrt(.5)]
    assert np.ptp(crown[:,:,0])<3


def test_tiny_bridge_stays_filled_instead_of_losing_piers():
    def tiny(xs,ys,geo):
        return np.zeros((len(ys),len(xs))),[
            ('road',LineString([(59,50),(61,50)]),{'highway':'primary','bridge':'yes'})]
    parts,meta=generate_solids(settings(buildings=False),quiet,tiny)
    assert meta['features']['supported_crossings']==1
    assert meta['features']['bridge_openings']==0
    assert as_trimesh(parts[0]['solid'],ensure_stl=True).is_volume


def test_opening_follows_lower_route_and_preserves_short_clipped_spans():
    line=LineString([(10,50),(110,50)])
    lower=LineString([(90,10),(90,90)])
    plans=bridge_opening_plan(line,line.buffer(1.5),box(0,0,0,0),lower,.4)
    assert len(plans)==1
    assert plans[0]['x']==pytest.approx(90)
    assert plans[0]['inferred'] is False
    assert plans[0]['width']==4
    # Crossings at a clipped end cannot leave enough material for a pier.
    end_crossing=LineString([(10.5,10),(10.5,90)])
    assert bridge_opening_plan(line,line.buffer(1.5),box(0,0,0,0),end_crossing,.4)==[]
