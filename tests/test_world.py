import json
import numpy as np
import pytest
from shapely.geometry import box

from backend.config import Bounds, Settings
from backend.geodata import Geography, search
from backend import buildings, polar
from backend.geometry import mapped_roof, as_trimesh, generate_solids
from backend.world import rectangles


def test_date_line_selection_has_local_dimensions_and_continuous_projection():
    s=Settings(bounds=Bounds(west=179.98,east=-179.98,south=-17.01,north=-16.99))
    geo=Geography(s)
    assert 4000<geo.ground_width<4500
    xs=[geo.point(lon,-17)[0] for lon in (179.98,179.99,180,-179.99,-179.98)]
    assert np.allclose(xs,np.linspace(geo.inset,s.width-geo.inset,5))
    assert rectangles(179.98,-17.01,-179.98,-16.99)==[(179.98,-17.01,180,-16.99),(-180,-17.01,pytest.approx(-179.98),-16.99)]
    with pytest.raises(ValueError): Bounds(west=2,east=1,south=0,north=1)
    with pytest.raises(ValueError): Bounds(west=-180,east=180,south=0,north=1)


@pytest.mark.parametrize('lat',[90,-90,86,-86])
def test_polar_bounds_project_without_mercator_singularities(lat):
    south=max(-90,lat-.02);north=min(90,lat+.02)
    geo=Geography(Settings(bounds=Bounds(west=12,east=12.1,south=south,north=north)))
    assert geo.polar
    assert np.isfinite(geo.scale) and geo.ground_width>0
    assert geo.point(12,south)==pytest.approx((geo.inset,geo.inset))
    assert geo.point(12.1,north)==pytest.approx((geo.settings.width-geo.inset,geo.settings.height-geo.inset))


def test_coordinate_search_does_not_need_a_geocoder(monkeypatch):
    from backend import geodata
    monkeypatch.setattr(geodata,'fetch',lambda *a,**kw:pytest.fail('coordinates must work offline'))
    assert search('90, 179.999')[0]['lat']=='90.0'
    with pytest.raises(ValueError):search('91, 0')


def test_polar_elevation_uses_real_grid_interpolation_and_splits_noaa_meridian():
    geo=Geography(Settings(frame_mode='none',width=100,height=100,bounds=Bounds(west=-.01,east=.01,south=86,north=86.02)))
    calls=[]
    def fetch(url,key,validate):
        calls.append(url)
        # Ascending NOAA grid order, with a known latitude-dependent elevation.
        lons=[359.97,359.98,359.99] if len(calls)==1 else [.0041666667,.0125,.0208333333]
        rows=[[lat,lon,lat*10] for lat in (85.99,86,86.01,86.02,86.03) for lon in lons]
        data=json.dumps({'table':{'columnNames':['latitude','longitude','z'],'rows':rows}}).encode()
        validate(data)
        return data
    dem,meta=polar.elevation(geo,np.linspace(0,100,5),np.linspace(0,100,5),lambda *a:None,fetch)
    assert len(calls)==2
    assert dem[:,0]==pytest.approx(np.linspace(860,860.2,5))
    assert np.allclose(dem[:,0],dem[:,-1])
    assert meta['sample_spacing_m']>900
    broken={'table':{'columnNames':['latitude','longitude','z'],'rows':[[0,0,1],[0,1,1],[1,0,None],[1,1,1]]}}
    with pytest.raises(ValueError):polar.decode(json.dumps(broken).encode())


def test_parent_does_not_flatten_mapped_wings_and_towers():
    parent=box(10,10,50,50);wing=box(10,10,30,50);tower=box(30,10,50,50)
    result=buildings.detailed_parts([('building',parent,{'height':'80'}),
                                   ('building',wing,{'building:part':'yes','height':'8'}),
                                   ('building',tower,{'building:part':'yes','height':'40'})])
    assert len(result)==2
    assert [t['height'] for k,g,t in result]==['8','40']


@pytest.mark.parametrize('shape',['gabled','hipped','pyramidal','skillion','dome','round','mansard','gambrel'])
def test_source_roofs_are_watertight_clipped_and_respect_total_height(shape):
    geom=box(10,10,30,20)
    roof=mapped_roof(geom,{'roof:shape':shape,'roof:height':'3','roof:direction':'35'},4,6,12)
    mesh=as_trimesh(roof)
    assert mesh.is_volume and mesh.is_watertight
    assert mesh.bounds[1,2]<=10.00001
    assert roof.volume()<geom.area*10
    assert mapped_roof(geom,{'roof:shape':'gabled'},4,6,12) is None


def test_city_roofs_survive_the_export_geometry_pipeline():
    s=Settings(width=100,height=100,resolution=64,labels=False,joints=False,frame_mode='none',small_buildings='keep',building_exaggeration=1,building_min_height=.2)
    def fixture(xs,ys,geo):
        return np.zeros((len(ys),len(xs))),[('building',box(30,30,65,60),{'building:part':'yes','height':'12','roof:shape':'gabled','roof:height':'3'})]
    parts,meta=generate_solids(s,lambda *a:None,fixture)
    assert as_trimesh(parts[0]['solid']).is_volume
    assert meta['features']['mapped_roofs']==1 and meta['features']['mapped_parts']==1
    assert meta['city_method']=='mapped-parts-roofs-v1'


def test_large_area_omits_mapped_buildings_without_changing_preferences(monkeypatch):
    from backend.world import selection_area_km2, MAX_BUILDING_AREA_KM2
    from backend.geodata import Downloader
    s = Settings(bounds=Bounds(west=0, east=.2, south=0, north=.2), building_source='combined')
    assert selection_area_km2(s.bounds) > MAX_BUILDING_AREA_KM2
    requested = []
    def download(self, settings):
        requested.append(settings.buildings)
        return {'elements': [{'type': 'way', 'id': 1, 'tags': {'building': 'yes'},
            'geometry': [{'lon': .05, 'lat': .05}, {'lon': .06, 'lat': .05},
                         {'lon': .06, 'lat': .06}, {'lon': .05, 'lat': .05}]}]}
    monkeypatch.setattr(Downloader, 'download', download)
    def unexpected(*args):
        pytest.fail('Large selections must not download Overture buildings')
    monkeypatch.setattr(buildings, 'download', unexpected)
    features, meta = Geography(s).vectors(lambda *args: None)
    assert features == []
    assert requested == [False]
    assert meta['building_detail_omitted']
    assert s.buildings  # Shrinking the selection restores the user's preference.
    smaller = s.model_copy(update={'bounds': Bounds(west=0, east=.02, south=0, north=.02), 'building_source': 'osm'})
    features, meta = Geography(smaller).vectors(lambda *args: None)
    assert requested == [False, True]
    assert not meta['building_detail_omitted']


def test_detail_area_matches_date_line_and_scales_at_poles():
    from backend.world import selection_area_km2
    normal = selection_area_km2(Bounds(west=0, east=.2, south=0, north=.2))
    crossing = selection_area_km2(Bounds(west=179.9, east=-179.9, south=0, north=.2))
    assert crossing == pytest.approx(normal)
    assert selection_area_km2(Bounds(west=0, east=.2, south=89, north=89.2)) < normal / 50
