"""Shared natural proportions and clockwise outline rotation for map and print."""
import json
import math
from pathlib import Path
from shapely.geometry import Polygon

OUTLINES = json.loads(Path(__file__).with_name('artwork-shapes.json').read_text())
RATIOS = json.loads(Path(__file__).with_name('artwork-ratios.json').read_text())

def uses_shape(s):
    return s.map_format == 'artwork' and (s.artwork_shape not in ('rectangle','square') or s.artwork_rotation % 360 != 0)

def rotated_rings(s):
    key = s.artwork_letter if s.artwork_shape == 'letter' else s.artwork_shape
    angle = math.radians(s.artwork_rotation)
    c, sn, ratio = math.cos(angle), math.sin(angle), RATIOS[key]
    rings = [[((x-.5)*ratio*c-(y-.5)*sn, (x-.5)*ratio*sn+(y-.5)*c) for x,y in ring] for ring in OUTLINES[key]]
    points = [p for ring in rings for p in ring]
    x0,y0 = map(min,zip(*points)); x1,y1 = map(max,zip(*points))
    return [[((x-x0)/(x1-x0), (y-y0)/(y1-y0)) for x,y in ring] for ring in rings]

def artwork_outline(s):
    area = Polygon()
    for ring in rotated_rings(s):
        area = area.symmetric_difference(Polygon([(x*s.width, (1-y)*s.height) for x,y in ring]))
    return area

def artwork_opening(s):
    outer=artwork_outline(s)
    return outer if s.frame_mode=='none' else outer.buffer(-s.frame_width,join_style=2)
