from math import ceil
from .world import longitude_span
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Bounds(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    west: float = Field(-3.155, ge=-180, le=180)
    south: float = Field(54.579, ge=-90, le=90)
    east: float = Field(-3.095, ge=-180, le=180)
    north: float = Field(54.601, ge=-90, le=90)

    @model_validator(mode='after')
    def ordered(self):
        if self.east == self.west or self.north <= self.south:
            raise ValueError('Select a rectangle with non-zero longitude width and south < north.')
        if longitude_span(self.west,self.east) > 2 or self.north-self.south > 2:
            raise ValueError('Select an area smaller than 2 degrees in each direction.')
        return self


class LocationMarker(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False, str_strip_whitespace=True)
    id: str = Field(min_length=1, max_length=64)
    label: str = Field('Special place', min_length=1, max_length=64)
    symbol: Literal['heart', 'star', 'pin'] = 'heart'
    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)
    size: float = Field(8, ge=3, le=30)
    rise: float = Field(3, ge=0.5, le=20)


class CustomBuilding(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False, str_strip_whitespace=True)
    id: str = Field(min_length=1, max_length=64)
    label: str = Field('Building', min_length=1, max_length=64)
    height: float = Field(8, ge=2, le=300)
    points: list[tuple[float, float]] = Field(min_length=3, max_length=100)

    @model_validator(mode='after')
    def valid_outline(self):
        from shapely.geometry import Polygon
        from .world import unwrap
        if any(not (-180 <= x <= 180 and -90 <= y <= 90) for x,y in self.points):
            raise ValueError('Building coordinates are outside the world.')
        polygon = Polygon([(unwrap(x,self.points[0][0]),y) for x,y in self.points])
        if not polygon.is_valid or polygon.area < 1e-14:
            raise ValueError('Building outlines must not cross themselves or have zero area.')
        return self


class ReferenceImage(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    data: str = Field(max_length=1_500_000, pattern=r'^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$')
    bounds: Bounds
    x: float = Field(500, ge=-5000, le=5000)
    y: float = Field(500, ge=-1e9, le=1e9)
    width: float = Field(1000, ge=10, le=10000)
    aspect: float = Field(1, ge=0.05, le=20)
    rotation: float = Field(0, ge=-360, le=360)
    opacity: float = Field(0.6, ge=0, le=1)


class Trail(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False, str_strip_whitespace=True)
    id: str = Field(min_length=1,max_length=64)
    name: str = Field('Trail',min_length=1,max_length=64)
    points: list[tuple[float,float]] = Field(min_length=2,max_length=10000)
    style: Literal['raised','engraved'] = 'raised'
    width: float = Field(1.6,ge=.8,le=8)
    height: float = Field(.8,ge=.2,le=2)
    @model_validator(mode='after')
    def coordinates(self):
        if any(not(-180<=x<=180 and -90<=y<=90) for x,y in self.points): raise ValueError('Trail coordinates must be longitude, latitude.')
        if len(set(self.points))<2:raise ValueError('A trail needs two distinct points.')
        return self

class MapTile(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False,str_strip_whitespace=True)
    id: str = Field(min_length=1,max_length=64)
    name: str = Field('Map tile',min_length=1,max_length=64)
    bounds: Bounds
    markers: list[LocationMarker] = Field(default_factory=list,max_length=20)
    trails: list[Trail] = Field(default_factory=list,max_length=20)
    custom_buildings: list[CustomBuilding] = Field(default_factory=list,max_length=500)
    reference_image: ReferenceImage | None = None


class Settings(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False, str_strip_whitespace=True)
    project_type: Literal['single','modular','jigsaw'] = 'single'
    map_format: Literal['artwork','mini_tiles','hexagons','jigsaw'] = 'artwork'
    tile_size: float = Field(80,ge=60,le=160)
    tile_gap: float = Field(6,ge=4,le=20)
    collection_columns: int = Field(2,ge=1,le=6)
    collection_rows: int = Field(2,ge=1,le=6)
    active_tile: int = Field(0,ge=0,le=35)
    map_tiles: list[MapTile] = Field(default_factory=list,max_length=36)
    mount_mode: Literal['seat','magnets'] = 'seat'
    magnet_diameter: float = Field(6,ge=3,le=12)
    magnet_depth: float = Field(2,ge=1,le=4)
    magnet_clearance: float = Field(.2,ge=.05,le=.5)
    puzzle_style: Literal["classic", "rounded"] = "rounded"
    puzzle_seed: int = Field(1,ge=1,le=9999)
    puzzle_columns: int = Field(3,ge=2,le=10)
    puzzle_rows: int = Field(2,ge=1,le=10)
    puzzle_clearance: float = Field(.25,ge=.1,le=.6)
    puzzle_relief: float = Field(.6,ge=.2,le=1.2)
    trails: list[Trail] = Field(default_factory=list,max_length=20)
    name: str = Field('Keswick', min_length=1, max_length=64)
    bounds: Bounds = Field(default_factory=Bounds)
    width: float = Field(600, ge=60, le=2000)
    height: float = Field(400, ge=60, le=2000)
    printer_width: float = Field(220, ge=80, le=1000)
    printer_height: float = Field(220, ge=80, le=1000)
    printer_z: float = Field(250, ge=20, le=1000)
    margin: float = Field(5, ge=0, le=30)
    layout: Literal['auto','manual'] = 'auto'
    columns: int = Field(3, ge=1, le=20)
    rows: int = Field(2, ge=1, le=20)
    base: float = Field(4, ge=3, le=20)
    exaggeration: float = Field(3, ge=0.1, le=30)
    land_variation: float = Field(1, ge=0, le=1)
    smoothing: float = Field(0.8, ge=0, le=5)
    terrain_style: Literal['smooth','terraced','sculpted','faceted'] = 'smooth'
    contour_height: float = Field(1.2, ge=0.2, le=10)
    facet_size: float = Field(12, ge=3, le=40)
    resolution: int = Field(640, ge=64, le=1024)
    seam: float = Field(0, ge=0, le=0.4)
    joints: bool = True
    tolerance: float = Field(0.2, ge=0.05, le=0.5)
    labels: bool = True
    frame_mode: Literal['integrated','separate','none'] = 'integrated'
    frame_contour: Literal['flat','minimum','follow'] = 'flat'
    frame_clearance: float = Field(1, ge=0.2, le=5)
    frame_width: float = Field(10, ge=4, le=40)
    frame_depth: float = Field(5, ge=3, le=20)
    frame_height: float = Field(12, ge=1, le=60)
    corner_radius: float = Field(2, ge=0, le=15)
    inner_bevel: float = Field(1, ge=0, le=4)
    outer_bevel: float = Field(0.8, ge=0, le=4)
    roads: Literal['raised','engraved','none'] = 'raised'
    road_width: float = Field(1.2, ge=0.6, le=5)
    road_height: float = Field(0.6, ge=0.2, le=3)
    water: bool = True
    water_width: float = Field(1.8, ge=0.8, le=8)
    water_depth: float = Field(0.8, ge=0.2, le=2)
    water_style: Literal['carved','smooth'] = 'carved'
    water_bank: float = Field(0, ge=0, le=3)
    forests: bool = False
    forest_style: Literal['canopy','trees'] = 'canopy'
    tree_type: Literal['broadleaf','conifer','mixed'] = 'mixed'
    forest_grouping: Literal['groves','even'] = 'groves'
    tree_size: float = Field(2.4, ge=1.2, le=6)
    tree_height: float = Field(1.8, ge=0.4, le=5)
    tree_spacing: float = Field(4, ge=1.5, le=12)
    fields: bool = False
    field_style: Literal['flat','furrows','rounded'] = 'rounded'
    field_spacing: float = Field(2.5, ge=1, le=8)
    field_height: float = Field(0.35, ge=0.2, le=1.5)
    field_angle: float = Field(25, ge=0, le=180)
    multicolour: bool = False
    colour_depth: float = Field(0.8, ge=0.4, le=2)
    colour_ground: str = Field('#80A768', pattern=r'^#[0-9a-fA-F]{6}$')
    colour_water: str = Field('#397CA7', pattern=r'^#[0-9a-fA-F]{6}$')
    colour_forest: str = Field('#80A768', pattern=r'^#[0-9a-fA-F]{6}$')
    colour_fields: str = Field('#E9DECA', pattern=r'^#[0-9a-fA-F]{6}$')
    colour_roads: str = Field('#E9DECA', pattern=r'^#[0-9a-fA-F]{6}$')
    colour_buildings: str = Field('#E9DECA', pattern=r'^#[0-9a-fA-F]{6}$')
    colour_frame: str = Field('#2B4045', pattern=r'^#[0-9a-fA-F]{6}$')
    colour_markers: str = Field('#2B4045', pattern=r'^#[0-9a-fA-F]{6}$')
    railways: bool = False
    railway_style: Literal['bed','tracks'] = 'tracks'
    railway_width: float = Field(2.4, ge=0.8, le=8)
    railway_height: float = Field(0.4, ge=0.2, le=1.5)
    road_hierarchy: bool = False
    urban_spaces: bool = False
    supported_crossings: bool = True
    bridge_openings: bool = True
    preserve_building_gaps: bool = False
    building_type_heights: bool = False
    buildings: bool = True
    building_source: Literal['combined','osm'] = 'combined'
    building_height: float = Field(8, ge=2, le=80)
    building_exaggeration: float = Field(1.5, ge=0.1, le=10)
    small_buildings: Literal['enhance','keep','omit'] = 'enhance'
    building_min_width: float = Field(0.8, ge=0.4, le=4)
    building_min_height: float = Field(1.2, ge=0.2, le=10)
    building_style: Literal['realistic','uniform','stepped'] = 'realistic'
    custom_buildings: list[CustomBuilding] = Field(default_factory=list, max_length=500)
    reference_image: ReferenceImage | None = None
    markers: list[LocationMarker] = Field(default_factory=list, max_length=20)
    landmarks: bool = False
    marker: bool = False
    marker_lon: float = Field(-3.125, ge=-180, le=180)
    marker_lat: float = Field(54.59, ge=-90, le=90)
    front_caption: bool = False
    nozzle: float = Field(0.4, ge=0.2, le=1)

    @model_validator(mode='after')
    def geometry_limits(self):
        if len({m.id for m in self.markers}) != len(self.markers):
            raise ValueError('Each special place must have a unique ID.')
        if len({b.id for b in self.custom_buildings}) != len(self.custom_buildings):
            raise ValueError('Each added building must have a unique ID.')
        if len({t.id for t in self.trails})!=len(self.trails):raise ValueError('Trail IDs must be unique.')
        if self.map_format in ('mini_tiles','hexagons'):
            from .formats import collection_size
            width,height=collection_size(self)
            if abs(width-self.width)>.01 or abs(height-self.height)>.01:raise ValueError('Collection dimensions must match tile size, spacing and border.')
            if len(self.map_tiles)!=self.collection_columns*self.collection_rows:raise ValueError('Assign a location to every collection tile.')
            if self.active_tile>=len(self.map_tiles):raise ValueError('Choose a valid active collection tile.')
            if len({t.id for t in self.map_tiles})!=len(self.map_tiles):raise ValueError('Map tile IDs must be unique.')
            if self.mount_mode=='magnets' and self.base<self.magnet_depth+self.magnet_clearance+1.2:raise ValueError('Increase base thickness to leave 1.2 mm above the magnet pocket.')
            if self.map_format=='hexagons' and self.tile_size+self.tile_gap>min(self.printer_width,self.printer_height)-2*self.margin:raise ValueError('Each hexagon holder must fit the usable build plate.')
        if self.map_format=='jigsaw':
            iw=self.width-(2*self.frame_width if self.frame_mode!='none' else 0);ih=self.height-(2*self.frame_width if self.frame_mode!='none' else 0)
            tw,th=iw/self.puzzle_columns,ih/self.puzzle_rows
            radius=min(tw,th)*.18
            if min(tw,th)<30:raise ValueError('Jigsaw pieces need at least 30 mm before tabs.')
            if tw+2.7*radius>self.printer_width-2*self.margin or th+2.7*radius>self.printer_height-2*self.margin:raise ValueError('Jigsaw pieces including tabs must fit the usable build plate. Increase piece count.')
        w = self.frame_width if self.frame_mode != 'none' else 0
        if 2*w >= min(self.width,self.height)-20:
            raise ValueError('Frame leaves too little room for the map.')
        if self.frame_mode != 'none':
            if self.inner_bevel+self.outer_bevel >= self.frame_width:
                raise ValueError('Combined bevel widths must be smaller than frame width.')
            if self.corner_radius > self.frame_width:
                raise ValueError('Corner radius must not exceed frame width.')
            if max(self.inner_bevel,self.outer_bevel) >= self.frame_depth+self.frame_height:
                raise ValueError('Bevel must be smaller than the total frame height.')
            if self.frame_contour != 'follow' and self.frame_depth+self.frame_height+(0.55 if self.front_caption else 0) > self.printer_z:
                raise ValueError('Frame exceeds the printer height. Reduce frame depth or raised height.')
            if self.frame_mode == 'separate' and self.joints and self.frame_width < 6:
                raise ValueError('Separate frames with joining keys require a frame width of at least 6 mm.')
        reserve = max(self.water_depth if self.water else 0, self.road_height if self.roads == 'engraved' else 0)
        if self.base+reserve > self.printer_z:
            raise ValueError('Base thickness and recessed features exceed the printer height.')
        cols, rows = self.tile_layout()
        if cols*rows > 100:
            raise ValueError('Maximum 100 terrain tiles per project.')
        if cols>20 or rows>20:
            raise ValueError('Maximum 20 rows or columns. Increase usable plate size or reduce artwork size.')
        if self.width/cols < 30 or self.height/rows < 30:
            raise ValueError('Tiles must be at least 30 mm on each side for registration and labels.')
        if w and min(self.width/cols,self.height/rows)-w < 24:
            raise ValueError('Frame must leave at least 24 mm of map on each border tile. Reduce frame width or tile count.')
        if self.width/cols > self.printer_width-2*self.margin+1e-6 or self.height/rows > self.printer_height-2*self.margin+1e-6:
            raise ValueError('Manual tiles exceed the usable build plate. Increase rows/columns or reduce margins.')
        return self

    def tile_layout(self):
        if self.layout == 'manual':
            return self.columns, self.rows
        return ceil(self.width/(self.printer_width-2*self.margin)), ceil(self.height/(self.printer_height-2*self.margin))


def tile_id(row, col):
    return f'{chr(65+row)}{col+1}'
