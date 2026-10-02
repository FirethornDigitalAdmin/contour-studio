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


class Settings(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False, str_strip_whitespace=True)
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
    tree_size: float = Field(2.4, ge=1.2, le=6)
    tree_height: float = Field(1.8, ge=0.4, le=5)
    tree_spacing: float = Field(4, ge=1.5, le=12)
    fields: bool = False
    field_style: Literal['flat','furrows'] = 'furrows'
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
    buildings: bool = True
    building_source: Literal['combined','osm'] = 'combined'
    building_height: float = Field(8, ge=2, le=80)
    building_exaggeration: float = Field(1.5, ge=0.1, le=10)
    small_buildings: Literal['enhance','keep','omit'] = 'enhance'
    building_min_width: float = Field(0.8, ge=0.4, le=4)
    building_min_height: float = Field(1.2, ge=0.2, le=10)
    building_style: Literal['realistic','uniform','stepped'] = 'realistic'
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
            if self.frame_depth+self.frame_height+(0.55 if self.front_caption else 0) > self.printer_z:
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
