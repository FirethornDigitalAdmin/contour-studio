"""Scale-aware plan geometry; all dimensions are in printed millimetres."""
import math
from shapely import affinity
from shapely.geometry import Polygon, LineString
from shapely.ops import unary_union

MAX_SLEEPERS = 1200
ACTIVE_RAIL = {'rail', 'light_rail', 'tram', 'narrow_gauge', 'preserved'}
GREEN_LEISURE = {'park', 'garden', 'recreation_ground', 'pitch', 'golf_course'}
HARD_LANDUSE = {'industrial', 'commercial', 'retail', 'railway'}


def printable_area(area, nozzle):
    """Remove strips narrower than two extrusion widths before relief capping."""
    return area.buffer(-nozzle).buffer(nozzle) if not area.is_empty else area


def enabled_tag(tags, key):
    return str(tags.get(key, 'no')).lower() not in ('no', 'false', '0', '', 'none')


def underground(tags):
    return enabled_tag(tags, 'tunnel') or tags.get('location') == 'underground'


def bridge_arch_profile(width):
    """Rounded barrel arch, restricted to a short printable crown span.

    Bridge plans cap the opening at 4 mm. The central region shallower than
    45 degrees is consequently at most sqrt(2)*2 = 2.83 mm across; this
    deliberately uses short bridging rather than a pointed crown.
    """
    half=width/2
    return [(-half,0)]+[(half*math.cos(i*math.pi/48),half*math.sin(i*math.pi/48))
                       for i in range(48)]


def bridge_opening_plan(line, area, water, lower_routes, nozzle):
    """One conservative opening per clipped span; units are printed mm.

    Prefer a mapped water/channel crossing, then a point route crossing.
    Missing underside mapping falls back to the span midpoint, not a claim
    about the real bridge. Keep at least two nozzle widths of side material.
    """
    lines = [line] if line.geom_type == 'LineString' else list(getattr(line,'geoms',[]))
    plans=[]
    for span in lines:
        if not isinstance(span,LineString): continue
        width=min(4.0,span.length/3)
        if width<3*nozzle or span.length<width+4*nozzle: continue
        overlap=span.intersection(water)
        mapped=not overlap.is_empty
        if mapped:
            pieces=[overlap] if overlap.geom_type=='LineString' else list(getattr(overlap,'geoms',[]))
            segments=[g for g in pieces if g.geom_type=='LineString' and g.length>0]
            point=max(segments,key=lambda g:g.length).interpolate(.5,normalized=True) if segments else overlap.representative_point()
        else:
            intersections=span.intersection(lower_routes)
            points=[intersections] if intersections.geom_type=='Point' else list(getattr(intersections,'geoms',[]))
            points=[p for p in points if p.geom_type=='Point']
            mapped=bool(points)
            point=min(points,key=lambda p:abs(span.project(p)-span.length/2)) if points else span.interpolate(.5,normalized=True)
        distance=span.project(point)
        # Do not punch through bridge ends or a clipped map boundary.
        if min(distance,span.length-distance)<width/2+2*nozzle: continue
        a=span.interpolate(distance-width/2); b=span.interpolate(distance+width/2)
        dx,dy=b.x-a.x,b.y-a.y
        length=math.hypot(dx,dy)
        if length<width*.95: continue  # sharp bends need to remain filled
        ux,uy=dx/length,dy/length
        vx,vy=-uy,ux
        reach=math.hypot(area.bounds[2]-area.bounds[0],area.bounds[3]-area.bounds[1])+1
        axis=LineString([(point.x-vx*reach,point.y-vy*reach),(point.x+vx*reach,point.y+vy*reach)])
        sections=axis.intersection(area)
        sections=[sections] if sections.geom_type=='LineString' else list(getattr(sections,'geoms',[]))
        sections=[g for g in sections if g.geom_type=='LineString' and g.distance(point)<.01]
        if len(sections)!=1: continue
        section=sections[0]
        start,end=section.coords[0],section.coords[-1]
        # Extend mouths beyond the bridge mask to make a through opening.
        lo=min((x-point.x)*vx+(y-point.y)*vy for x,y in (start,end))-.1
        hi=max((x-point.x)*vx+(y-point.y)*vy for x,y in (start,end))+.1
        footprint=Polygon([(point.x+ux*u+vx*v,point.y+uy*u+vy*v)
                           for u,v in [(-width/2,lo),(width/2,lo),(width/2,hi),(-width/2,hi)]])
        # Curves and narrow masks can leave roof wings without enough pillars.
        if not area.buffer(.11).covers(footprint): continue
        mouth_points=[(point.x+ux*u+vx*v,point.y+uy*u+vy*v)
                      for u in (-width/2,0,width/2) for v in (lo,hi)]
        plans.append(dict(x=point.x,y=point.y,angle=math.degrees(math.atan2(uy,ux)),
                          width=width,lo=lo,hi=hi,footprint=footprint,
                          mouth_points=mouth_points,inferred=not mapped))
    return plans


def road_width(tags, s, scale):
    if not s.road_hierarchy: return s.road_width
    factors = {'motorway': 2, 'trunk': 1.8, 'primary': 1.6, 'secondary': 1.35,
               'tertiary': 1.15, 'residential': 1, 'unclassified': 1, 'service': .8,
               'living_street': .8, 'track': .7, 'path': .55, 'footway': .55,
               'cycleway': .6, 'steps': .55, 'pedestrian': .75}
    width = s.road_width * factors.get(tags.get('highway'), 1)
    try:
        mapped = float(str(tags.get('width', '')).split()[0])
        if math.isfinite(mapped) and mapped > 0: width = mapped * scale
    except (ValueError, IndexError): pass
    return max(2*s.nozzle, min(width, 5*s.road_width))


def fallback_height(tags, fallback):
    # Relative estimates only, never presented as measured building heights.
    kind = tags.get('building')
    factor = {'house': 1, 'detached': 1, 'semidetached_house': 1, 'terrace': 1,
              'bungalow': .55, 'shed': .4, 'garage': .4, 'garages': .4,
              'apartments': 2, 'office': 2, 'hotel': 2, 'warehouse': 1.2,
              'industrial': 1.2, 'church': 2}.get(kind, 1)
    return fallback * factor


def railway_plan(features, s, scale, clip):
    beds=[]; detail=[]; bridges=[]; counts={'railways':0,'rail_detail_lines':0,'rail_simplified_lines':0,'sleepers':0,'platforms':0}
    stroke = 2*s.nozzle
    width = max(s.railway_width, 3*stroke)
    for kind, geom, tags in features:
        if kind != 'railway' or not s.railways or underground(tags): continue
        if tags.get('railway') == 'platform':
            area = geom.buffer(stroke) if geom.geom_type in ('LineString','MultiLineString') else geom
            area=printable_area(area.intersection(clip),s.nozzle)
            if not area.is_empty:
                beds.append(area); counts['platforms']+=1
            continue
        if tags.get('railway') not in ACTIVE_RAIL: continue
        lines = [geom] if geom.geom_type == 'LineString' else list(getattr(geom,'geoms',[]))
        for line in lines:
            if not isinstance(line,LineString) or line.length < .01: continue
            bed=line.buffer(width/2,cap_style=1,join_style=1).intersection(clip)
            beds.append(bed); counts['railways']+=1
            if s.supported_crossings and enabled_tag(tags,'bridge'): bridges.append((line,bed))
            # Only show individual tracks when real scaled gauge AND bed width
            # leave room for two two-extrusion rails and an open nozzle-width gap.
            try: gauge=float(str(tags.get('gauge','1435')).split(';')[0])/1000*scale
            except ValueError: gauge=1.435*scale
            if not math.isfinite(gauge): gauge=0
            if s.railway_style != 'tracks' or gauge < stroke+s.nozzle or gauge+2*stroke > width:
                counts['rail_simplified_lines']+=1; continue
            counts['rail_detail_lines']+=1
            for side in (-1,1):
                detail.append(line.offset_curve(side*gauge/2).buffer(stroke/2).intersection(bed))
            spacing=max(3*stroke,2*s.nozzle)
            for i in range(min(MAX_SLEEPERS-counts['sleepers'],math.ceil(line.length/spacing))):
                distance=min(line.length,i*spacing+spacing/2)
                a=line.interpolate(max(0,distance-.1)); b=line.interpolate(min(line.length,distance+.1))
                p=line.interpolate(distance)
                sleeper=Polygon([(-stroke/2,-width/2),(stroke/2,-width/2),(stroke/2,width/2),(-stroke/2,width/2)])
                sleeper=affinity.rotate(sleeper,math.degrees(math.atan2(b.y-a.y,b.x-a.x)),origin=(0,0))
                detail.append(affinity.translate(sleeper,p.x,p.y).intersection(bed)); counts['sleepers']+=1
    return unary_union(beds),unary_union(detail),bridges,counts
