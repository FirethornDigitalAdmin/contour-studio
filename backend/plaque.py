"""Frame lettering and a matching nameplate, in assembled mm."""
import math

from shapely import affinity
from shapely.geometry import Point, box
from shapely.ops import unary_union

from .world import longitude_span

FONTS = {'sans': 'DejaVu Sans', 'serif': 'DejaVu Serif'}
BASE = 2.4
RELIEF = .8
RIM = 1.2


def coordinates(s):
    b = s.bounds
    lat, lon = (b.north+b.south)/2, ((b.west+longitude_span(b.west, b.east)/2+180) % 360-180)
    return f"{abs(lat):.4f}° {'N' if lat >= 0 else 'S'}  {abs(lon):.4f}° {'E' if lon >= 0 else 'W'}"


def caption_text(s):
    """Custom lettering, or the place name and its coordinates when none is written."""
    return s.caption_text.strip() or f'{s.name.upper()} · {coordinates(s)}'


def lettering(text, width, size, font='sans', height=None):
    """Centred outline of one line, reduced to fit the given width and optional height."""
    from .geometry import text_shape
    shape = text_shape(text, width, size, FONTS[font])
    if shape.is_empty or height is None:
        return shape
    x0, y0, x1, y1 = shape.bounds
    return affinity.scale(shape, min(1, height/(y1-y0)), min(1, height/(y1-y0)), origin=(0, 0)) if y1-y0 > height else shape


def outline(shape, width, height):
    if shape == 'oval':
        return affinity.scale(Point(0, 0).buffer(1, quad_segs=32), width/2, height/2)
    plate = box(-width/2, -height/2, width/2, height/2)
    radius = min(height*.2, 6)
    if shape == 'rounded':
        return plate.buffer(-radius).buffer(radius, quad_segs=12)
    if shape == 'ticket':
        # The scooped corners of an engraved museum label.
        return plate.difference(unary_union([Point(x, y).buffer(radius, quad_segs=12)
                                             for x in (-width/2, width/2) for y in (-height/2, height/2)]))
    return plate


def plaque_layout(s):
    """Stack up to three centred lines and size the plate around them."""
    width = s.plaque_width
    pad = max(4, width*.07)
    inner = width*(.74 if s.plaque_shape == 'oval' else 1)-2*pad-(2*RIM+2 if s.plaque_border else 0)
    title = s.plaque_title.strip() or s.name
    lines = [(title.upper() if s.plaque_capitals else title, width*.115)]
    if s.plaque_subtitle.strip():
        lines.append((s.plaque_subtitle.strip(), width*.058))
    detail = s.plaque_detail.strip() or (coordinates(s) if s.plaque_coordinates else '')
    if detail:
        lines.append((detail, width*.046))
    heading = lettering(lines[0][0], inner, lines[0][1], s.plaque_font)
    if heading.is_empty:
        raise ValueError('Add a title to the plaque.')
    # A long title is reduced to fit; smaller lines stay smaller than it.
    cap = heading.bounds[3]-heading.bounds[1]
    shapes = [heading]+[lettering(text, inner, size, s.plaque_font, cap*limit) for (text, size), limit in zip(lines[1:], (.66, .56) if len(lines) == 3 else (.62,))]
    shapes = [shape for shape in shapes if not shape.is_empty]
    heights = [shape.bounds[3]-shape.bounds[1] for shape in shapes]
    gap = max(1.6, heights[0]*.42)
    total = sum(heights)+gap*(len(shapes)-1)
    margin = pad+(RIM+1.5 if s.plaque_border else 0)
    height = (total+2*margin)*(1.3 if s.plaque_shape == 'oval' else 1)
    placed = []
    y = total/2
    for shape, h in zip(shapes, heights):
        x0, y0, x1, y1 = shape.bounds
        placed.append(affinity.translate(shape, -(x0+x1)/2, y-h/2-(y0+y1)/2))
        y -= h+gap
    return unary_union(placed), width, height, min(heights)


def plaque_parts(s):
    """A separate nameplate, placed beneath the artwork in the assembled preview."""
    from .geometry import prism
    if not s.plaque:
        return [], []
    letters, width, height, smallest = plaque_layout(s)
    plate = outline(s.plaque_shape, width, height)
    marks = [letters]
    if s.plaque_border:
        marks.append(plate.buffer(-1.5, join_style=1).difference(plate.buffer(-1.5-RIM, join_style=1)))
    marks = unary_union(marks).intersection(plate.buffer(-.8))
    base = prism(plate, BASE)
    if s.plaque_style == 'raised':
        raised = prism(marks, RELIEF, BASE)
        solid = base+raised
        regions = {'frame': base, 'markers': raised}
    else:
        cut = prism(marks, RELIEF+.01, BASE-RELIEF)
        solid = base-cut
        regions = {'frame': solid}
    # Centre it under the artwork so the preview shows the finished piece together.
    move = (s.width/2, -height/2-12, 0)
    part = {'id': 'Plaque', 'kind': 'frame', 'solid': solid.translate(move), 'row': 0, 'column': 0, 'neighbours': {}}
    if s.multicolour:
        part['material_regions'] = {name: region.translate(move) for name, region in regions.items()}
    usable = min(s.printer_width, s.printer_height)-2*s.margin
    if max(width, height) > usable:
        raise ValueError('The plaque is wider than your build plate. Reduce its width.')
    warnings = [f'Plaque: {width:g} × {height:.1f} mm, {BASE+(RELIEF if s.plaque_style=="raised" else 0):g} mm thick, with a flat back for adhesive or foam tape.']
    if smallest < max(1.6, 4*s.nozzle):
        warnings.append(f'The smallest plaque lettering is {smallest:.1f} mm tall. A {s.nozzle:g} mm nozzle may blur it; widen the plaque or shorten that line.')
    if s.plaque_style == 'raised' and not s.multicolour:
        warnings.append('For two-colour plaque lettering without an AMS, add a filament change at 2.4 mm in your slicer.')
    return [part], warnings
