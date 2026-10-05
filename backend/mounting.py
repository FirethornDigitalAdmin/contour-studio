"""Rear wall-mounting features shared by every project type, in assembled mm.

Keyholes slide down onto a screw head. Pucks are square wall plates fixed with
one screw each; a holder pushes straight on, so a tile can be added on any side
of a mounted wall. The square carries the tile's weight and stops it turning.
"""
import math

from shapely import affinity
from shapely.geometry import Point, box

KEYHOLE_DEPTH = 2.8
KEYHOLE_TRAVEL = 7.0
KEYHOLE_ROOF = 1.2
PUCK_SIDE = 30.0
PUCK_RADIUS = 4.0
PUCK_THICKNESS = 2.4
PUCK_MAGNET_OFFSET = 9.5
PUCK_SCREW = 4.4
PUCK_HEAD = 8.6


def puck_modes(s):
    return s.hang_mode in ('pucks', 'magnet_pucks')


def puck_thickness(s):
    return max(PUCK_THICKNESS, s.magnet_depth+s.magnet_clearance+.4) if s.hang_mode == 'magnet_pucks' else PUCK_THICKNESS


def socket_depth(s):
    return puck_thickness(s)+.2


def holder_floor(s):
    """Thickness a holder needs beneath its insert seat for the chosen mounting."""
    pocket = s.magnet_depth+s.magnet_clearance
    if s.hang_mode == 'magnet_pucks':
        return socket_depth(s)+pocket+(pocket if s.mount_mode == 'magnets' else 0)+1.0
    if s.hang_mode == 'pucks':
        return socket_depth(s)+(pocket+.8 if s.mount_mode == 'magnets' else 1.4)
    if s.hang_mode == 'keyholes':
        return KEYHOLE_DEPTH+KEYHOLE_ROOF
    return 0


def puck_pitch(s):
    """Centre distance between neighbouring holders; every hexagon neighbour is equidistant."""
    return (s.tile_size*math.sqrt(3)/2 if s.map_format == 'hexagons' else s.tile_size)+s.tile_gap


def keyhole_cut(x, y):
    """Entry for a 6 mm screw head at (x, y); the part drops 7 mm so the shank sits in the throat above."""
    from .geometry import prism
    entry = Point(x, y).buffer(3.5, quad_segs=24)
    cavity = entry.union(Point(x, y+KEYHOLE_TRAVEL).buffer(3.5, quad_segs=24)).convex_hull
    throat = Point(x, y).buffer(1.8, quad_segs=24).union(Point(x, y+KEYHOLE_TRAVEL).buffer(1.8, quad_segs=24)).convex_hull
    return prism(entry, KEYHOLE_DEPTH, -.01)+prism(cavity, 1.8, 1)+prism(throat, 1.1, -.01)


def keyhole_footprint(x, y, margin=2.5):
    return box(x-3.5-margin, y-3.5-margin, x+3.5+margin, y+KEYHOLE_TRAVEL+3.5+margin)


def keyhole_positions(width, y, allowed, blocked, count=2):
    """Symmetric screw positions near the top edge, moved off seams, pockets and labels."""
    result = []
    for wanted in ([width/2] if count == 1 else [width*.2, width*.8]):
        for step in range(0, int(width/2)+1, 2):
            found = next((x for x in ((wanted,) if not step else (wanted+step, wanted-step))
                          if allowed.covers(keyhole_footprint(x, y, 0)) and not any(keyhole_footprint(x, y).intersects(b) for b in blocked)
                          and all(abs(x-other) > 40 for other, _ in result)), None)
            if found is not None:
                result.append((found, y)); break
    return result


def puck_outline(grow=0):
    return box(-PUCK_SIDE/2, -PUCK_SIDE/2, PUCK_SIDE/2, PUCK_SIDE/2).buffer(-PUCK_RADIUS).buffer(PUCK_RADIUS+grow, quad_segs=12)


def puck_magnets(s, cx=0, cy=0):
    radius = (s.magnet_diameter+s.magnet_clearance)/2
    return [Point(cx, cy+dy).buffer(radius, quad_segs=24) for dy in (-PUCK_MAGNET_OFFSET, PUCK_MAGNET_OFFSET)]


def socket_cut(s, cx, cy):
    """Square rear recess for a wall puck, with blind magnet pockets above it when chosen."""
    from .geometry import prism, union
    depth = socket_depth(s)
    cut = prism(affinity.translate(puck_outline(s.tolerance), cx, cy), depth+.01, -.01)
    if s.hang_mode == 'magnet_pucks':
        cut = cut+union([prism(m, s.magnet_depth+s.magnet_clearance, depth-.01) for m in puck_magnets(s, cx, cy)])
    return cut


def puck_solid(s):
    """Prints wall side down. A countersunk screw sits flush below the tile-side face."""
    import manifold3d as md
    from .geometry import prism, union
    thickness = puck_thickness(s)
    outline = puck_outline()
    if s.hang_mode == 'pucks':
        # Four shallow side ribs give a push fit that grips inside the socket clearance.
        proud = s.tolerance+.12
        ribs = [Point(x, y).buffer(1.2, quad_segs=8) for x, y in
                [(PUCK_SIDE/2-1.2+proud, 0), (-PUCK_SIDE/2+1.2-proud, 0), (0, PUCK_SIDE/2-1.2+proud), (0, -PUCK_SIDE/2+1.2-proud)]]
        outline = outline.union(union_2d(ribs))
    solid = prism(outline, thickness)
    cone_height = min(thickness-.4, (PUCK_HEAD-PUCK_SCREW)/2)
    cone = md.Manifold.cylinder(cone_height+.01, PUCK_SCREW/2, PUCK_HEAD/2, 48).translate((0, 0, thickness-cone_height))
    solid = solid-prism(Point(0, 0).buffer(PUCK_SCREW/2, quad_segs=12), thickness+.02, -.01)-cone
    if s.hang_mode == 'magnet_pucks':
        solid = solid-union([prism(m, s.magnet_depth+s.magnet_clearance+.01, thickness-s.magnet_depth-s.magnet_clearance) for m in puck_magnets(s)])
    return solid


def union_2d(shapes):
    from shapely.ops import unary_union
    return unary_union(shapes)


def spacing_jig(s, usable):
    """Drops over a mounted puck and holds the next one square at the wall's tile pitch."""
    from .geometry import prism
    pitch = puck_pitch(s)
    bar = box(-PUCK_SIDE/2-5, -PUCK_SIDE/2-5, pitch+PUCK_SIDE/2+5, PUCK_SIDE/2+5).buffer(-3).buffer(3, quad_segs=8)
    for x in (0, pitch):
        bar = bar.difference(affinity.translate(puck_outline(.3), x, 0))
    # A slim waist keeps the bar light without losing stiffness along its length.
    if pitch > PUCK_SIDE+30:
        for y in (-1, 1):
            bar = bar.difference(box(PUCK_SIDE/2+10, y*(PUCK_SIDE/2+5), pitch-PUCK_SIDE/2-10, y*7).buffer(-2).buffer(2, quad_segs=6))
    solid = prism(bar, 2)
    if pitch+PUCK_SIDE+10 > usable:
        solid = solid.rotate((0, 0, 45))
        x0, y0, *_ = solid.bounding_box()
        solid = solid.translate((-x0, -y0, 0))
    return solid


def wall_parts(s, count, usable):
    """Printed wall hardware for a puck-mounted project."""
    from .formats import record
    from .geometry import prism
    puck = record('Wall_puck', 'key', puck_solid(s))
    puck['quantity'] = count
    block = box(-PUCK_SIDE/2-4, -PUCK_SIDE/2-4, PUCK_SIDE/2+4, PUCK_SIDE/2+4)
    fit = prism(block, holder_floor(s))-socket_cut(s, 0, 0)
    return [puck, record('Puck_spacing_jig', 'key', spacing_jig(s, usable)), record('Puck_Socket_Fit', 'coupon', fit)]


def describe(s, count=0):
    """Plain assembly facts for the guide, model information and the interface."""
    if s.hang_mode == 'none':
        return None
    info = {'mode': s.hang_mode, 'screw': '3.5-4 mm countersunk screw' if puck_modes(s) else 'screw with a head up to 6 mm and a shank up to 3.5 mm'}
    if puck_modes(s):
        info.update(pucks=count, pitch_mm=round(puck_pitch(s), 3), puck_mm=PUCK_SIDE, puck_thickness_mm=round(puck_thickness(s), 2),
                    magnets=2*count*2 if s.hang_mode == 'magnet_pucks' else 0)
    return info
