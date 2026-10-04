"""Build one global solid; every printable part is an exact Boolean section."""
import math
import re

import contourpy
import manifold3d as md
import numpy as np
import trimesh
from matplotlib.textpath import TextPath
from matplotlib.font_manager import FontProperties
from scipy.ndimage import gaussian_filter, map_coordinates, minimum_filter, maximum_filter
from shapely import affinity
from shapely import set_precision
from shapely.geometry import Polygon, MultiPolygon, box, Point
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

from .config import tile_id
from .world import longitude_span
from .infrastructure import road_width, fallback_height, underground, enabled_tag, railway_plan, printable_area, bridge_opening_plan, bridge_arch_profile
from .geodata import Geography

MAX_TREES = 1200
MAX_FIELD_STRIPS = 800
GEOMETRY_REVISION = 'map-formats-v13'
FRAME_LIP_WIDTH = 2.0
FRAME_LIP_HEIGHT = 2.0


def printable_footprint(geom):
    """Resolve source-mask slivers on a 0.005 mm printable coordinate grid."""
    if geom.is_empty: return geom
    snapped=set_precision(geom,0.005,mode='valid_output')
    # Snapping can make neighbouring outlines meet at exactly one corner.
    # Give those contacts a finite overlap before extrusion, rather than a
    # four-face edge when STL vertices are welded. Reset the precision model
    # so the one-micron overlap is not rounded back onto the source grid.
    return set_precision(snapped,0).buffer(0.001,join_style=2)


def material_partition(solid, candidates, progress=None, core=None):
    """Exact, disjoint regions in descending semantic priority."""
    core_part=solid^core if core is not None else md.Manifold()
    remaining=solid-core_part if core is not None else solid
    regions={}
    for name in ('markers','frame','buildings','roads','water','forest','fields'):
        candidate=candidates.get(name)
        if candidate is None: continue
        if progress: progress(f'preparing {name} colour')
        if callable(candidate): candidate=candidate()
        if candidate.is_empty(): continue
        if progress: progress(f'separating {name} colour ({candidate.num_tri():,} surface faces)')
        region,remaining=remaining.split(candidate)
        if name=='frame' and not core_part.is_empty():
            frame_core=core_part^candidate
            if frame_core.volume()>1e-8:
                region=region+frame_core
                core_part=core_part-frame_core
        if not region.is_empty() and region.volume()>1e-8:
            regions[name]=region
    if core is not None:
        if progress: progress('joining the uncoloured surface to its terrain core')
        remaining=core_part+remaining
    if not remaining.is_empty(): regions['ground']=remaining
    return regions


def supported_tree_solid(footprint, floor, height, tip_ratio, broadleaf=False, rooted=False, stem_width=0):
    """One shared ring mesh keeps the terrain pedestal and crown watertight."""
    ring=np.asarray(orient(footprint,sign=1).exterior.coords)[:-1,:2]
    centre=ring.mean(axis=0)
    profile=[(0,1),(floor,1)]
    if rooted:
        radius=max(np.linalg.norm(ring-centre,axis=1))
        # Keep the crown flare at or below 45 degrees from vertical. Short,
        # wide trees automatically use a broader supporting stem/skirt.
        stem=min(1,max(.35,stem_width/(2*radius),1-height*.35/radius))
        profile=[(0,stem),(floor+height*.25,stem),
                 (floor+height*.60,1),(floor+height*.75,.95),
                 (floor+height*.90,.70),(floor+height,.08)]
    elif broadleaf:
        # Rounded, tapering crown: no unsupported branches or separate trunk.
        profile.extend((floor+height*z,r) for z,r in [(0.25,.97),(.5,.86),(.75,.65),(.93,.35),(1,.08)])
    else:
        profile.append((floor+height,tip_ratio))
    count=len(ring)
    vertices=np.vstack([*[np.column_stack([centre+(ring-centre)*r,np.full(count,z)]) for z,r in profile],
                        [centre[0],centre[1],0],[centre[0],centre[1],floor+height]])
    faces=[]; bottom=len(profile)*count; top=bottom+1
    for i in range(count):
        j=(i+1)%count
        faces.append((bottom,j,i))
        for level in range(len(profile)-1):
            lo=level*count; hi=lo+count
            faces.extend([(lo+i,lo+j,hi+j),(lo+i,hi+j,hi+i)])
        last=(len(profile)-1)*count
        faces.append((top,last+i,last+j))
    return mesh_manifold(vertices,faces)


def landcover_geometry(forests, fields, exclusions, original, s, sample, limit):
    """Bounded, deterministic print textures inside actual source polygons."""
    forest=forests.difference(exclusions)
    field=fields.difference(exclusions.union(forests))
    added=[]; tree_count=0; strip_count=0; warnings=[]; tree_points=[]
    tree_footprints=[]; field_footprint=Polygon()
    if s.forests and not forest.is_empty:
        spacing=max(s.tree_spacing,s.tree_size*0.8)
        if spacing>s.tree_spacing:
            warnings.append(f'Tree spacing was increased to {spacing:.2f} mm to suit the selected crown size.')
        x0,y0,x1,y1=forest.bounds
        expected=max(1,math.ceil((x1-x0)/spacing)*math.ceil((y1-y0)/spacing))
        if expected>MAX_TREES:
            spacing*=math.sqrt(expected/MAX_TREES)
            warnings.append(f'Forest texture spacing was increased to {spacing:.2f} mm to keep the sampling grid below {MAX_TREES} tree positions.')
        radius=s.tree_size/2
        def add_tree(x,y):
            nonlocal tree_count
            footprint=Point(x,y).buffer(radius,quad_segs=4)
            if tree_count>=MAX_TREES or not forest.covers(footprint): return
            if any(math.hypot(x-px,y-py)<spacing-1e-6 for px,py in tree_points): return
            floor=float(max(sample(list(footprint.exterior.coords))))
            height=s.tree_height*(0.55 if s.forest_style=='canopy' else 1)
            if floor+height>s.printer_z:
                raise ValueError('Forest texture exceeds the printer height. Reduce tree height or terrain exaggeration.')
            # Shared pedestal/crown vertices make a single supported solid.
            tree=supported_tree_solid(footprint,floor,height,
                                      0.65 if s.forest_style=='canopy' else 0.04,
                                      broadleaf=s.forest_style=='trees' and (s.tree_type=='broadleaf' or
                                          (s.tree_type=='mixed' and (round(x/spacing)+round(y/spacing))%3!=0)))
            added.append(tree); tree_points.append((x,y)); tree_footprints.append(footprint); tree_count+=1
        if s.forest_grouping=='groves':
            # Seven crowns per grove, with a full spacing gap between groups.
            grove_spacing=spacing*4
            for row,y in enumerate(np.arange(y0+spacing,y1,grove_spacing)):
                for x in np.arange(x0+spacing+(grove_spacing/2 if row%2 else 0),x1,grove_spacing):
                    add_tree(x,y)
                    for i in range(6):
                        angle=i*math.pi/3+row*.3
                        add_tree(x+spacing*1.05*math.cos(angle),y+spacing*1.05*math.sin(angle))
        else:
            for row,y in enumerate(np.arange(y0+spacing/2,y1,spacing)):
                for x in np.arange(x0+spacing/2+(spacing*.25 if row%2 else 0),x1,spacing):
                    add_tree(x,y)
        # A small woodland can fit a crown while falling between grid points.
        # Give unsampled fragments one safe interior candidate, retaining the
        # requested minimum spacing and the same global geometry cap.
        for polygon in ([forest] if isinstance(forest,Polygon) else getattr(forest,'geoms',[])):
            if tree_count>=MAX_TREES: break
            if not isinstance(polygon,Polygon) or any(polygon.covers(Point(x,y)) for x,y in tree_points): continue
            inset=polygon.buffer(-radius)
            if inset.is_empty: continue
            x,y=inset.representative_point().coords[0]
            if any(math.hypot(x-px,y-py)<spacing for px,py in tree_points): continue
            add_tree(x,y)
    forest_added=union(added)
    field_added=md.Manifold()
    if s.fields and s.field_style!='flat' and not field.is_empty:
        # Rotate the polygon into stripe coordinates, then clip and rotate back;
        # courtyards, forest boundaries and all exclusions remain intact.
        rotated=affinity.rotate(field,-s.field_angle,origin=(0,0))
        x0,y0,x1,y1=rotated.bounds
        spacing=s.field_spacing
        expected=math.ceil((y1-y0)/spacing)
        if expected>MAX_FIELD_STRIPS:
            spacing=(y1-y0)/MAX_FIELD_STRIPS
            warnings.append(f'Field spacing was increased to {spacing:.2f} mm to limit texture to {MAX_FIELD_STRIPS} strips.')
        width=min(spacing*0.4,max(s.nozzle*2,0.6))
        if width<2*s.nozzle:
            warnings.append(f'Field ridges are {width:.2f} mm wide, less than two nozzle widths. Increase field spacing or use a finer nozzle if the slicer loses them.')
        strips=[]; crowns=[]
        for y in np.arange(y0+spacing/2,y1,spacing)[:MAX_FIELD_STRIPS]:
            strip=box(x0,y-width/2,x1,y+width/2).intersection(rotated)
            if s.field_style=='rounded':
                # Round each clipped row end while respecting holes and exclusions.
                pieces=[]
                for piece in ([strip] if isinstance(strip,Polygon) else getattr(strip,'geoms',[])):
                    if not isinstance(piece,Polygon) or piece.is_empty: continue
                    rounding=min(width,piece.bounds[3]-piece.bounds[1])*.45
                    pieces.append(piece.buffer(-rounding).buffer(rounding,quad_segs=4))
                strip=unary_union(pieces).intersection(rotated)
            if not strip.is_empty:
                strips.append(affinity.rotate(strip,s.field_angle,origin=(0,0))); strip_count+=1
                if s.field_style=='rounded':
                    # A half-ellipse across every row creates an arched roof.
                    # Sample along its length to follow the underlying terrain.
                    angles=np.linspace(-math.pi/2,math.pi/2,17)
                    left,_,right,_=strip.bounds
                    xs=np.linspace(left,right,max(2,math.ceil(right-left)+1))
                    ys=y+width/2*np.sin(angles)
                    xx,yy=np.meshgrid(xs,ys)
                    radians=math.radians(s.field_angle)
                    wx=xx*math.cos(radians)-yy*math.sin(radians)
                    wy=xx*math.sin(radians)+yy*math.cos(radians)
                    floor=np.asarray(sample(np.column_stack([wx.ravel(),wy.ravel()]))).reshape(xx.shape)
                    roof=floor+s.field_height*np.cos(angles)[:,None]
                    crowns.append(terrain_solid(xs,ys,roof).rotate((0,0,s.field_angle)))
        if strips:
            # Clipped neighbouring fields can leave ridge fragments touching
            # only at one corner. The same bounded source-grid overlap used
            # for roads joins those contacts before they become vertical
            # four-face edges, and paint uses this exact adjusted footprint.
            field_footprint=printable_footprint(unary_union(strips))
            mask=prism(field_footprint,limit)
            # Full draped columns union cleanly with the terrain; subtracting
            # the original here creates fragile coincident ribbon shells.
            field_added=(union(crowns) if s.field_style=='rounded' else original.translate((0,0,s.field_height)))^mask
    return forest_added,field_added,tree_count,strip_count,warnings,unary_union(tree_footprints),field_footprint


def rounded_canopy_solid(footprint, original, s, sample, limit):
    """Supported, lobed foliage relief clipped to real canopy, including holes.

    Lobes are a surface treatment, never inferred tree/trunk locations. Every
    roof sample has a continuous column to the terrain, so there are no
    unsupported branches or canopy undersides.
    """
    from shapely import points, distance
    x0,y0,x1,y1=footprint.bounds
    # Bounded local mesh resolution; narrow mapped rows get enough samples
    # across the crown to distinguish a rounded roof from a building block.
    step=max(.12,min(.35,s.tree_size/10))
    nx=min(240,max(5,math.ceil((x1-x0)/step)+1))
    ny=min(240,max(5,math.ceil((y1-y0)/step)+1))
    xs=np.linspace(x0,x1,nx); ys=np.linspace(y0,y1,ny)
    xx,yy=np.meshgrid(xs,ys)
    pts=np.column_stack([xx.ravel(),yy.ravel()])
    edge=distance(points(pts),footprint.boundary).reshape(xx.shape)
    radius=s.tree_size/2
    rounded=np.sin(np.minimum(edge/radius,1)*math.pi/2)
    # Smooth overlapping domes provide recognisable foliage on larger
    # patches; no separate tree positions are added to the source metadata.
    waves=(.5+.5*np.cos(xx*2*math.pi/s.tree_size))*(.5+.5*np.cos(yy*2*math.pi/s.tree_size))
    rise=s.tree_height*(.10+rounded*(.62+.28*waves))
    roof=np.asarray(sample(pts)).reshape(xx.shape)+rise
    if roof.max()>s.printer_z:
        raise ValueError('Mapped canopy exceeds printer height. Reduce tree height.')
    return terrain_solid(xs,ys,roof)^prism(footprint,limit)


def mapped_tree_geometry(features, exclusions, clip, original, s, sample, limit):
    """Point crowns at mapped coordinates; rows and groups retain continuous cover."""
    solids=[]; footprints=[]; crowns=[]; counts={'mapped_trees':0,'tree_rows':0,'tree_canopies':0,'omitted_tree_details':0}
    occupied=Polygon()
    for kind,geom,tags in features:
        if kind not in ('tree','tree_row','tree_canopy'): continue
        if kind=='tree':
            if counts['mapped_trees']>=MAX_TREES:
                counts['omitted_tree_details']+=1; continue
            # Geometry is stylised at the recorded point, never relocated.
            footprint=geom.buffer(s.tree_size/2,quad_segs=4)
            if not clip.covers(footprint) or footprint.intersects(exclusions) or footprint.intersects(occupied):
                counts['omitted_tree_details']+=1; continue
            floor=float(max(sample(list(footprint.exterior.coords))))
            rise=s.tree_height
            if floor+rise>s.printer_z: raise ValueError('Mapped tree exceeds printer height. Reduce tree height.')
            solid=supported_tree_solid(footprint,floor,rise,.04,
                broadleaf=s.tree_type!='conifer',rooted=s.tree_type!='conifer',stem_width=2*s.nozzle)
            crowns.append(solid); counts['mapped_trees']+=1
        else:
            # OSM rows locate a line, not individual trunks. Width is a visible
            # print representation, with no invented tree spacing.
            footprint=geom.buffer(max(s.tree_size,2*s.nozzle)/2) if kind=='tree_row' else geom
            footprint=footprint.intersection(clip).difference(exclusions).simplify(.025,preserve_topology=True)
            # Leave undersized data out; do not expand source canopy patches.
            if footprint.is_empty or footprint.buffer(-s.nozzle).is_empty:
                counts['omitted_tree_details']+=1; continue
            footprint=printable_footprint(footprint).intersection(clip).difference(exclusions)
            solid=rounded_canopy_solid(footprint,original,s,sample,limit)
            if solid.is_empty(): continue
            if solid.bounding_box()[5]>s.printer_z: raise ValueError('Mapped canopy exceeds printer height. Reduce tree height.')
            counts['tree_rows' if kind=='tree_row' else 'tree_canopies']+=1
        solids.append(solid); footprints.append(footprint)
        if kind=='tree': occupied=occupied.union(footprint)
    return union(solids),unary_union(footprints),counts


def union(parts):
    return md.Manifold.batch_boolean(parts,md.OpType.Add) if parts else md.Manifold()


def fill_enclosed_voids(solid):
    # Intersections between roofs, terrain and bevels can enclose tiny air cells.
    # Negative-volume shells are internal cavities, not detached printable parts.
    # Contour/channel tangencies also leave exactly flat sheets whose native
    # volume fluctuates around zero. They are not printable feature islands.
    return union([part for part in solid.decompose() if part.volume()>1e-8])


def prism(geom, height, bottom=0):
    polygons=[geom] if isinstance(geom,Polygon) else [g for g in getattr(geom,'geoms',[]) if isinstance(g,Polygon)]
    contours=[]
    for p in polygons:
        p=orient(p,sign=1)
        contours.append(np.asarray(p.exterior.coords[:-1],dtype=float))
        contours.extend(np.asarray(r.coords[:-1],dtype=float) for r in p.interiors)
    if not contours: return md.Manifold()
    return md.CrossSection(contours,md.FillRule.NonZero).extrude(height).translate((0,0,bottom))


def source_height(tags, fallback):
    """OSM values can contain units, lists, negative values or invalid numbers."""
    value=tags.get('height')
    if value is not None:
        text=str(value).strip().lower()
        match=re.match(r'^([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)',text)
        if match:
            height=float(match[1])
            if 'ft' in text or "'" in text or 'feet' in text:
                height*=0.3048
            if math.isfinite(height) and height>0:
                return height
    try:
        levels=float(tags.get('building:levels',0))
        if math.isfinite(levels) and levels>0:
            return levels*3
    except (ValueError,TypeError):
        pass
    return fallback


def mapped_roof(geom, tags, floor, relief, real_h):
    """Printable, source-tagged roof forms clipped to the actual building outline.

    Unsupported forms retain source-height blocks; no decorative roof is invented.
    Ridge direction uses the mapped bearing or the footprint's long axis.
    """
    shape = tags.get('roof:shape','flat')
    if shape not in ('gabled','hipped','pyramidal','skillion','dome','round','mansard','gambrel'): return None
    roof_m = source_height({'height':tags.get('roof:height'), 'building:levels':tags.get('roof:levels',0)},0)
    if not roof_m: return None
    rise = min(relief*.95, relief*roof_m/max(real_h,roof_m))
    with np.errstate(divide="ignore", invalid="ignore"):
        rect = geom.minimum_rotated_rectangle
    if not isinstance(rect,Polygon): return None
    pts = list(rect.exterior.coords)
    edges = [(math.dist(pts[i],pts[i+1]),pts[i],pts[i+1]) for i in range(4)]
    _,a,b = max(edges,key=lambda e:e[0])
    angle = math.degrees(math.atan2(b[1]-a[1],b[0]-a[0]))
    if tags.get('roof:orientation')=='across': angle+=90
    try:
        direction=float(tags.get('roof:direction','nan'))
        if math.isfinite(direction): angle=90-direction
    except (ValueError,TypeError): pass
    cx,cy=geom.centroid.coords[0]
    rotated=affinity.rotate(geom,-angle,origin=(cx,cy))
    x0,y0,x1,y1=rotated.bounds
    half=min((x1-x0)/2,(y1-y0)/2)
    if shape=='dome':
        base=floor+relief-rise
        dome=md.Manifold.sphere(1,32).scale(((x1-x0)/2,(y1-y0)/2,rise)).rotate((0,0,angle)).translate((cx,cy,base))
        return (prism(geom,base)+dome) ^ prism(geom,floor+relief)
    xs=np.unique([x0,x0+half,(x0+x1)/2,x1-half,x1]) if shape=='hipped' else np.linspace(x0,x1,3)
    ys=np.linspace(y0,y1,17 if shape=='round' else 9 if shape in ('mansard','gambrel') else 3)
    xx,yy=np.meshgrid(xs,ys)
    cross=1-np.abs(2*(yy-y0)/(y1-y0)-1)
    along=1-np.abs(2*(xx-x0)/(x1-x0)-1)
    if shape=='hipped': profile=np.minimum(cross,np.minimum(xx-x0,x1-xx)/half)
    elif shape=='pyramidal': profile=np.minimum(cross,along)
    elif shape=='skillion': profile=(yy-y0)/(y1-y0)
    elif shape=='round': profile=np.sqrt(np.maximum(0,1-(2*(yy-y0)/(y1-y0)-1)**2))
    elif shape in ('mansard','gambrel'):
        q=np.minimum(cross,along) if shape=='mansard' else cross
        profile=np.where(q<.5,q*1.5,.75+(q-.5)*.5)
    else: profile=cross
    z=floor+relief-rise+profile*rise
    # Rotate around footprint centre, preserving its assembled coordinates.
    roof=terrain_solid(xs-cx,ys-cy,z).rotate((0,0,angle)).translate((cx,cy,0))
    return roof ^ prism(geom,floor+relief)


def mesh_manifold(vertices, faces):
    result=md.Manifold(md.Mesh64(np.asarray(vertices,dtype=np.float64),np.asarray(faces,dtype=np.uint64)))
    if result.status()!=md.Error.NoError:
        raise ValueError(f'Invalid source mesh: {result.status()}')
    return result


def terrain_solid(xs,ys,z):
    ny,nx=z.shape
    xx,yy=np.meshgrid(xs,ys)
    verts=np.column_stack([xx.ravel(),yy.ravel(),z.ravel()]).tolist()
    faces=[]
    for j in range(ny-1):
        for i in range(nx-1):
            a=j*nx+i; b=a+1; d=a+nx; c=d+1
            faces.extend([(a,b,c),(a,c,d)])
    perimeter=list(range(nx))+[j*nx+nx-1 for j in range(1,ny)]+list(range((ny-1)*nx+nx-2,(ny-1)*nx-1,-1))+[j*nx for j in range(ny-2,0,-1)]
    offset=len(verts)
    verts.extend([[verts[i][0],verts[i][1],0] for i in perimeter])
    centre=len(verts); verts.append([float(np.mean(xs)),float(np.mean(ys)),0])
    for k,a in enumerate(perimeter):
        nxt=(k+1)%len(perimeter); b=perimeter[nxt]; lo=offset+k; ln=offset+nxt
        faces.extend([(a,lo,ln),(a,ln,b),(centre,ln,lo)])
    return mesh_manifold(verts,faces)


def terraced_solid(xs, ys, relief, base, step, progress=None):
    """Stack interpolated contour polygons, never quantized square grid cells.

    OuterOffset preserves boundary-clipped contours, holes and separate hills.
    Extruding every level from the bed makes overlapping layers a single solid.
    """
    generator = contourpy.contour_generator(x=xs, y=ys, z=relief, fill_type='OuterOffset')
    layers = [prism(box(xs[0], ys[0], xs[-1], ys[-1]), base)]
    count = int(np.floor(float(relief.max()) / step))
    for band in range(1, count + 1):
        if progress and (band == 1 or band % 10 == 0):
            progress(34, f'Tracing smooth contour layer {band} of {count}')
        points, offsets = generator.filled(band * step, np.inf)
        contours = [vertices[start:end-1] for vertices, rings in zip(points, offsets)
                    for start, end in zip(rings[:-1], rings[1:]) if end-start >= 4]
        if contours:
            section = md.CrossSection(contours, md.FillRule.EvenOdd)
            if not section.is_empty():
                layers.append(section.extrude(base + band * step))
    return union(layers)


def style_terrain(xs, ys, relief, s):
    """Style the global relief before features and tile cuts; all units are mm."""
    if s.terrain_style == 'faceted':
        # Coarse triangles are real geometry, independent of print-tile layout.
        # Never invent finer detail than the sampled elevation field.
        nx = min(len(xs), max(3, math.ceil((xs[-1]-xs[0])/s.facet_size)+1))
        ny = min(len(ys), max(3, math.ceil((ys[-1]-ys[0])/s.facet_size)+1))
        ix, iy = np.meshgrid(np.linspace(0, len(xs)-1, nx), np.linspace(0, len(ys)-1, ny))
        relief = map_coordinates(relief, [iy, ix], order=1, mode='nearest')
        return np.linspace(xs[0], xs[-1], nx), np.linspace(ys[0], ys[-1], ny), relief
    if s.terrain_style in ('terraced', 'sculpted'):
        bands = relief / s.contour_height
        floor = np.floor(bands)
        if s.terrain_style == 'terraced':
            # Reference samples for feature placement; the solid itself uses
            # interpolated contour polygons rather than this quantized grid.
            relief = floor * s.contour_height
        else:
            # Rounded shoulders around broad shelves, preserving band continuity.
            t = np.clip((bands-floor-0.2)/0.6, 0, 1)
            relief = (floor + t*t*(3-2*t)) * s.contour_height
    return xs, ys, relief


def rounded_loop(x0,y0,x1,y1,r):
    if r<=0:
        return np.array([[x0,y0],[x1,y0],[x1,y1],[x0,y1]])
    r=min(r,(x1-x0)/2-0.01,(y1-y0)/2-0.01)
    pts=[]
    for cx,cy,start in [(x1-r,y0+r,-90),(x1-r,y1-r,0),(x0+r,y1-r,90),(x0+r,y0+r,180)]:
        for angle in np.linspace(start,start+90,9):
            pts.append([cx+r*math.cos(math.radians(angle)),cy+r*math.sin(math.radians(angle))])
    return np.array(pts)


def densify_frame_loops(loops, spacing=1.0):
    """All rings share subdivisions so their triangles stitch at corners."""
    result=[[] for _ in loops]
    for i in range(len(loops[0])):
        j=(i+1)%len(loops[0])
        steps=max(1,math.ceil(max(np.linalg.norm(loop[j]-loop[i]) for loop in loops)/spacing))
        for k in range(steps):
            for out,loop in zip(result,loops):
                out.append(loop[i]+(loop[j]-loop[i])*k/steps)
    return [np.asarray(out) for out in result]


def frame_profile(s, sample):
    """Top above finished land; the inner bevel preserves edge clearance."""
    def height(points):
        points=np.asarray(points)
        edge=np.column_stack((np.clip(points[:,0],s.frame_width,s.width-s.frame_width),
                              np.clip(points[:,1],s.frame_width,s.height-s.frame_width)))
        land=np.asarray(sample(edge))
        top=land+s.frame_clearance+s.inner_bevel
        floor=(s.frame_depth+s.frame_height if s.frame_contour=='minimum' else
               max(s.frame_depth,FRAME_LIP_HEIGHT+0.1)+max(s.inner_bevel,s.outer_bevel)+0.1)
        return np.maximum(top,floor)
    return height


def frame_loops(s, contoured=False):
    w,h,fw=s.width,s.height,s.frame_width
    rounded=s.corner_radius>0
    inner_radius=min(0.5,s.corner_radius) if rounded else 0
    outer=rounded_loop(0,0,w,h,s.corner_radius)
    outer_top=rounded_loop(s.outer_bevel,s.outer_bevel,w-s.outer_bevel,h-s.outer_bevel,
                           max(0.01,s.corner_radius-s.outer_bevel) if rounded else 0)
    inner=rounded_loop(fw,fw,w-fw,h-fw,inner_radius)
    ib=s.inner_bevel
    # The opening widens towards the top. The previous inward top ring
    # projected an unsupported ledge over low terrain along all four edges.
    inner_top=rounded_loop(fw-ib,fw-ib,w-fw+ib,h-fw+ib,
                           inner_radius+ib if rounded else 0)
    loops=[outer,outer_top,inner,inner_top]
    return densify_frame_loops(loops) if contoured else loops


def frame_top_sample(s,profile):
    """Interpolate the same triangle planes used for the front of the ring."""
    outer,ot,inner,it=frame_loops(s,True)
    ot=ot if s.outer_bevel else outer
    it=it if s.inner_bevel else inner
    heights=profile(inner)
    j=np.roll(np.arange(len(ot)),-1)
    triangles=np.concatenate((np.stack((ot,ot[j],it[j]),axis=1),np.stack((ot,it[j],it),axis=1)))
    z=np.concatenate((np.stack((heights,heights[j],heights[j]),axis=1),np.stack((heights,heights[j],heights),axis=1)))
    a=triangles[:,0]; u=triangles[:,1]-a; v=triangles[:,2]-a
    det=u[:,0]*v[:,1]-u[:,1]*v[:,0]
    def sample(x,y):
        d=np.array([x,y])-a
        p=(d[:,0]*v[:,1]-d[:,1]*v[:,0])/det
        q=(u[:,0]*d[:,1]-u[:,1]*d[:,0])/det
        hits=np.flatnonzero((p>=-1e-6)&(q>=-1e-6)&(p+q<=1+1e-6))
        if not len(hits):
            raise ValueError('Caption does not fit the flat width of the contoured frame. Increase border width.')
        k=hits[0]
        return float(z[k,0]+p[k]*(z[k,1]-z[k,0])+q[k]*(z[k,2]-z[k,0]))
    return sample


def frame_solid(s, profile=None):
    """A single stitched ring mesh avoids coplanar Boolean bevel artefacts."""
    w,h,fw=s.width,s.height,s.frame_width
    ib=s.inner_bevel
    outer,outer_top,inner,inner_top=frame_loops(s,profile is not None)
    top=s.frame_depth+s.frame_height if profile is None else profile(inner)
    if float(np.max(top))+(0.55 if s.front_caption else 0) > s.printer_z:
        raise ValueError('Contoured frame exceeds the printer height. Reduce land variation or frame clearance.')
    n=len(outer); vertices=[]; faces=[]
    def ring(points,z):
        start=len(vertices)
        heights=np.broadcast_to(z,len(points))
        vertices.extend([[x,y,float(h)] for (x,y),h in zip(points,heights)])
        return start
    def connect(a,b,reverse=False):
        for i in range(n):
            j=(i+1)%n
            tris=[(a+i,a+j,b+j),(a+i,b+j,b+i)]
            faces.extend([tuple(reversed(t)) for t in tris] if reverse else tris)
    ob=ring(outer,0)
    previous=ob
    if s.outer_bevel:
        shoulder=ring(outer,top-s.outer_bevel); connect(previous,shoulder); previous=shoulder
    ot=ring(outer_top if s.outer_bevel else outer,top); connect(previous,ot)
    itb=ring(inner,0)
    previous=itb
    if ib:
        shoulder=ring(inner,top-ib); connect(previous,shoulder,True); previous=shoulder
    it=ring(inner_top if ib else inner,top); connect(previous,it,True)
    connect(ot,it); connect(itb,ob)
    frame=mesh_manifold(vertices,faces)
    if s.frame_mode=='separate':
        # A finite wall overlap avoids coplanar contacts. The shelf narrows
        # towards the front: its seat matches the insert's supported chamfer.
        overlap=0.1
        shelf=prism(box(fw-overlap,fw-overlap,w-fw+overlap,h-fw+overlap),FRAME_LIP_HEIGHT)-frame_chamfer_core(s)
        frame=frame+shelf
    return frame


def frame_insert_footprint(s, inset=0):
    """The wall opening, including the real rounded inside corners."""
    fw=s.frame_width+inset
    radius=min(0.5,s.corner_radius) if s.corner_radius else 0
    return Polygon(rounded_loop(fw,fw,s.width-fw,s.height-fw,radius))


def frame_chamfer_core(s):
    """Central rear-down insert seat with four exact 45-degree planes.

    Square mitres stay below the actual rounded perimeter. The central back
    is flat and each inclined underside face grows by one mm per mm of rise.
    """
    fw=s.frame_width; lip=FRAME_LIP_WIDTH
    bottom=rounded_loop(fw+lip,fw+lip,s.width-fw-lip,s.height-fw-lip,0)
    top=rounded_loop(fw,fw,s.width-fw,s.height-fw,0)
    vertices=np.vstack([np.column_stack([bottom,np.zeros(4)]),
                        np.column_stack([top,np.full(4,FRAME_LIP_HEIGHT)])])
    faces=[(0,2,1),(0,3,2),(4,5,6),(4,6,7)]
    for i in range(4):
        j=(i+1)%4
        faces.extend([(i,j,4+j),(i,4+j,4+i)])
    return mesh_manifold(vertices,faces)


def key_shape(tolerance=0):
    # Two wider lobes prevent sideways slip; a flush underside key bridges the seam.
    poly=Polygon([(-5,-3),(-2,-3),(-1,-1.8),(1,-1.8),(2,-3),(5,-3),(5,3),(2,3),(1,1.8),(-1,1.8),(-2,3),(-5,3)])
    return poly.buffer(tolerance,join_style=2)


def text_shape(text, width, size=3):
    # Explicit DejaVu bundled with matplotlib keeps lettering portable.
    path=TextPath((0,0),text,size=size,prop=FontProperties(family='DejaVu Sans',weight='bold'))
    rings=[Polygon(p) for p in path.to_polygons() if len(p)>=3]
    shape=Polygon()
    for ring in rings: shape=shape.symmetric_difference(ring)
    if shape.is_empty: return shape
    x0,y0,x1,y1=shape.bounds
    factor=min(1,width/(x1-x0))
    shape=affinity.translate(affinity.scale(shape,factor,factor,origin=(0,0)),xoff=-(x0+x1)*factor/2,yoff=-(y0+y1)*factor/2)
    # Some glyph contours (including the Y in CITY OF LONDON) touch at a
    # point. A one-micron overlap makes their extrusions printable solids.
    return shape.buffer(0.001,join_style=2)


def label_tile(part,s,identifier,bounds,neighbours):
    x0,y0,x1,y1=bounds
    cx,cy=(x0+x1)/2,(y0+y1)/2
    width=min(72,(x1-x0)-16)
    height=min(22,(y1-y0)-12)
    # Recess ceiling is at z=.7. Start the lettering on the bed so its
    # first layers do not begin in air when the tile is printed rear-down.
    part=part-prism(box(cx-width/2-1,cy-height/2-1,cx+width/2+1,cy+height/2+1),0.8,-0.1)
    lines=[(identifier+'  TOP ↑',4.2,6),(s.name.upper(),2.4,0),
           (' '.join(f'{d[0]}:{v}' for d,v in neighbours.items() if v) or 'SINGLE TILE',2.2,-5.5)]
    letters=[]
    for text,size,y in lines:
        shape=text_shape(text,width,size)
        shape=affinity.scale(shape,xfact=-1,yfact=1,origin=(0,0))
        shape=affinity.translate(shape,cx,cy+y)
        letters.append(prism(shape,0.75,0))
    return part+union(letters)


def short_edge_clusters(vertices, edges, tolerance=0.0001):
    """Map coincident sliver endpoints without allowing a chain to grow."""
    parents=np.arange(len(vertices))
    members={}
    for a,b in edges:
        while parents[a]!=a: a=parents[a]
        while parents[b]!=b: b=parents[b]
        if a==b: continue
        target=min(a,b)
        group=members.get(a,[a])+members.get(b,[b])
        if np.all(np.linalg.norm(vertices[group]-vertices[target],axis=1)<=tolerance):
            parents[max(a,b)]=target
            members[target]=group
    while np.any(parents!=parents[parents]): parents=parents[parents]
    return parents


def clean_mesh_faces(mesh):
    """Weld export positions without deleting necessary thin triangles.

    Trimesh's validate=True removes triangles by a height threshold, leaving
    holes in dense city intersections. Remove only duplicate/repeated-index
    faces, and collapse sub-0.1-micron edges of exactly zero-area triangles.
    Callers still require a closed volume and enforce their volume checks.
    """
    mesh.process()

    def drop_repeated():
        faces=mesh.faces
        mesh.update_faces((faces[:,0]!=faces[:,1]) & (faces[:,0]!=faces[:,2]) & (faces[:,1]!=faces[:,2]))
        mesh.update_faces(mesh.unique_faces())
        mesh.remove_unreferenced_vertices()

    drop_repeated()
    faces=mesh.faces[mesh.area_faces==0]
    if len(faces):
        edges=np.stack((faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]),axis=1)
        lengths=np.linalg.norm(mesh.vertices[edges[:,:,0]]-mesh.vertices[edges[:,:,1]],axis=2)
        shortest=edges[np.arange(len(edges)),lengths.argmin(axis=1)]
        shortest=shortest[lengths.min(axis=1)<=0.0001]
        # One pass retains the original members when bounding displacement;
        # repeated passes could lose that history and grow a collapse chain.
        parents=short_edge_clusters(mesh.vertices,shortest)
        mesh.faces=parents[mesh.faces]
    drop_repeated()
    return mesh


def as_trimesh(solid, *, ensure_stl=False, stl_origin=None):
    # Keep the exact Boolean mesh whenever it is printable. Simplification
    # can change the volume of narrow contour faces, so it is only a repair.
    # STL eligibility must be checked after translating to the actual shared
    # print origin: float32 rounding differs between assembly and bed positions.
    volume=solid.volume()
    tolerance=max(.001,abs(volume)*1e-6)

    def preserves_volume(mesh):
        return math.isfinite(mesh.volume) and abs(mesh.volume-volume)<=tolerance

    def printable(mesh):
        return (mesh.is_volume and mesh.is_watertight and mesh.is_winding_consistent
                and np.isfinite(mesh.vertices).all() and preserves_volume(mesh))

    def acceptable(mesh):
        if not printable(mesh):
            return False
        if not ensure_stl:
            return True
        local=mesh.copy()
        origin=mesh.bounds[0] if stl_origin is None else np.asarray(stl_origin, dtype=float)
        if origin.shape!=(3,) or not np.isfinite(origin).all():
            raise ValueError('The STL print origin must contain three finite coordinates.')
        local.apply_translation(-origin)
        local.vertices=local.vertices.astype(np.float32).astype(np.float64)
        clean_mesh_faces(local)
        # Compare every repair/rounding stage directly with the native solid,
        # rather than allowing the individual stage allowances to accumulate.
        return printable(local)

    def convert(raw):
        mesh=trimesh.Trimesh(vertices=np.array(raw.vert_properties)[:,:3],
                             faces=np.array(raw.tri_verts),process=True)
        cleaned=clean_mesh_faces(mesh.copy())
        if acceptable(cleaned):
            return cleaned
        if acceptable(mesh):
            return mesh
        if preserves_volume(cleaned):
            mesh=cleaned
        # Collapse coordinates at the actual binary STL precision, retaining
        # only repairs that close the mesh and preserve its Boolean volume.
        repaired=trimesh.Trimesh(vertices=mesh.vertices.astype(np.float32).astype(np.float64),
                                 faces=mesh.faces.copy(),process=False)
        clean_mesh_faces(repaired)
        return repaired if acceptable(repaired) else mesh

    mesh=convert(solid.to_mesh64())
    if not acceptable(mesh):
        repaired=convert(solid.as_original().simplify(0.0001).to_mesh64())
        if acceptable(repaired):
            mesh=repaired
    if not preserves_volume(mesh):
        raise ValueError('Mesh conversion exceeded the permitted volume change; no print package was published.')
    if ensure_stl and not acceptable(mesh):
        raise ValueError('Solid is not representable as a watertight binary STL at this scale; no print package was published.')
    return mesh


def marker_shape(symbol, size):
    if symbol == 'heart':
        a=np.linspace(0,2*math.pi,97)[:-1]
        shape=Polygon(np.column_stack((16*np.sin(a)**3,
            13*np.cos(a)-5*np.cos(2*a)-2*np.cos(3*a)-np.cos(4*a))))
    elif symbol == 'star':
        shape=Polygon([(math.cos(math.pi/2+i*math.pi/5)*(1 if i%2==0 else 0.48),
                        math.sin(math.pi/2+i*math.pi/5)*(1 if i%2==0 else 0.48)) for i in range(10)])
    else:
        shape=unary_union([Point(0,0.3).buffer(0.65, quad_segs=24),Polygon([(-0.55,0),(0,-1),(0.55,0)])])
    x0,y0,x1,y1=shape.bounds
    shape=affinity.translate(shape,-(x0+x1)/2,-(y0+y1)/2)
    return affinity.scale(shape,xfact=size/max(x1-x0,y1-y0),yfact=size/max(x1-x0,y1-y0),origin=(0,0))


def generate_solids(s, progress, data_override=None):
    if s.map_format != 'artwork':
        from .formats import generate_format
        return generate_format(s,progress,data_override)
    geo=Geography(s)
    longest=max(geo.map_width,geo.map_height)
    nx=max(16,round(s.resolution*geo.map_width/longest))+1
    ny=max(16,round(s.resolution*geo.map_height/longest))+1
    xs=np.linspace(geo.inset,s.width-geo.inset,nx)
    ys=np.linspace(geo.inset,s.height-geo.inset,ny)
    if data_override:
        dem,features=data_override(xs,ys,geo)
        dem_meta={'provider':'Synthetic TEST fixture; not geographic data'}
        osm_meta={'provider':'Synthetic TEST fixture','elements':len(features)}
    else:
        dem,dem_meta=geo.elevation(xs,ys,progress)
        features,osm_meta=geo.vectors(progress)
    from .custom_buildings import merge_custom_buildings
    features, custom_count = merge_custom_buildings(features, s, geo)
    progress(32,'Building the continuous terrain solid')
    smoothed=gaussian_filter(dem,s.smoothing) if s.smoothing else dem
    reserve=max(s.water_depth if s.water else 0,s.road_height if s.roads=='engraved' else 0, max((t.height for t in s.trails if t.style=='engraved'),default=0))
    relief=(smoothed-smoothed.min())*geo.scale*s.exaggeration*s.land_variation
    continuous_relief=relief
    xs,ys,relief=style_terrain(xs,ys,relief,s)
    ny,nx=relief.shape
    z=s.base+reserve+relief
    if not np.isfinite(z).all() or float(z.max()) > s.printer_z:
        raise ValueError('Terrain dimensions exceed the printer height. Reduce terrain height multiplier or increase printer height.')
    if s.terrain_style == 'terraced':
        terrain=terraced_solid(xs,ys,continuous_relief,s.base+reserve,s.contour_height,progress)
    else:
        terrain=terrain_solid(xs,ys,z)
    original=terrain
    limit=max(s.printer_z,float(z.max())+100)
    roads=[]; waters=[]; buildings=[]; building_tops=[]; forest_areas=[]; field_areas=[]; grass_areas=[]; warnings=[]
    if osm_meta.get('warning'):
        warnings.append(osm_meta['warning'])
    if osm_meta.get('tree_canopy',{}).get('warning'):
        warnings.append(osm_meta['tree_canopy']['warning'])
    if osm_meta.get('tree_canopy',{}).get('status')=='loaded':
        warnings.append(osm_meta['tree_canopy']['attribution'])
        warnings.append(osm_meta['tree_canopy']['limitation'])
    if osm_meta.get('building_detail_omitted'):
        warnings.append('Mapped building detail omitted: selected area exceeds 100 km². Select a smaller area to include buildings.')
    if s.terrain_style in ('terraced','sculpted') and float(relief.max()) < s.contour_height:
        warnings.append('This area has less relief than one contour band. Reduce contour height or increase the terrain height multiplier for a more visible style.')
    map_clip=box(geo.inset,geo.inset,s.width-geo.inset,s.height-geo.inset)
    if abs((geo.ground_width/geo.ground_height)/(geo.map_width/geo.map_height)-1)>0.05:
        warnings.append('The selected geographic rectangle differs from the artwork aspect ratio by more than 5%; horizontal geography is stretched to fill. Use “Match artwork ratio” on the map to preserve proportions.')
    def sample(points):
        pts=np.asarray(points)
        ix=np.clip((pts[:,0]-xs[0])/(xs[-1]-xs[0])*(nx-1),0,nx-1)
        iy=np.clip((pts[:,1]-ys[0])/(ys[-1]-ys[0])*(ny-1),0,ny-1)
        if s.terrain_style == 'terraced':
            heights=map_coordinates(continuous_relief,[iy,ix],order=1,mode='nearest')
            return s.base+reserve+np.floor(heights/s.contour_height)*s.contour_height
        i=np.minimum(ix.astype(int),nx-2); j=np.minimum(iy.astype(int),ny-2)
        u=ix-i; v=iy-j
        # Match the actual triangle planes, especially on large facets.
        a=z[j,i]; b=z[j,i+1]; c=z[j+1,i+1]; d=z[j+1,i]
        return np.where(u>=v,a+(b-a)*u+(c-b)*v,a+(c-d)*u+(d-a)*v)
    rail_area,rail_detail,rail_bridges,rail_counts=railway_plan(features,s,geo.scale,map_clip)
    bridge_plans=list(rail_bridges); parks=[]; hardscapes=[]
    street_clearance=unary_union([g.buffer(road_width(tags,s,geo.scale)/2+2*s.nozzle)
        for k,g,tags in features if k=='road' and s.roads!='none' and not underground(tags)])
    street_clearance=street_clearance.union(rail_area.buffer(2*s.nozzle))
    source_buildings=[g for k,g,tags in features if k=='building' and not tags.get('building:part')]
    from shapely.strtree import STRtree
    building_index=STRtree(source_buildings)
    constrained_buildings=0; typed_heights=0; tunnel_count=0
    count={'roads':0,'water':0,'buildings':0,'landmarks':0,'omitted_small_buildings':0,'enhanced_buildings':0,'markers':0,'skipped_invalid_features':0,
           'forest_areas':0,'field_areas':0,'grass_areas':0,'trees':0,'field_strips':0,
           'mapped_trees':0,'tree_rows':0,'tree_canopies':0,'omitted_tree_details':0,
           'mapped_roofs':0,'mapped_parts':0,'source_height_buildings':0,'fallback_height_buildings':0,'unmodelled_roofs':0}
    for kind,geom,tags in features:
        if kind=='road' and s.roads!='none':
            if s.supported_crossings and underground(tags):
                tunnel_count+=1; continue
            if tags.get('highway') in ('proposed','construction'): continue
            area=geom.simplify(0.12).buffer(road_width(tags,s,geo.scale)/2,cap_style=1,join_style=1)
            roads.append(area); count['roads']+=1
            if s.supported_crossings and enabled_tag(tags,'bridge'): bridge_plans.append((geom,area))
        elif kind=='water' and s.water:
            if s.water_style=='smooth' or s.water_bank:
                geom=geom.simplify(0.05,preserve_topology=True)
            if geom.geom_type in ('LineString','MultiLineString'):
                try:
                    real_width=float(str(tags.get('width','0')).split()[0])
                    width=max(s.water_width,real_width*geo.scale) if math.isfinite(real_width) else s.water_width
                except (ValueError,IndexError): width=s.water_width
                geom=geom.buffer(width/2)
            waters.append(geom); count['water']+=1
        elif kind in ('park','hardscape') and s.urban_spaces:
            if isinstance(geom,(Polygon,MultiPolygon)):
                (parks if kind=='park' else hardscapes).append(geom.intersection(map_clip))
        elif kind in ('forest','field','grass') and (s.forests or s.fields or s.multicolour):
            geom=geom.intersection(map_clip)
            if isinstance(geom,(Polygon,MultiPolygon)) and not geom.is_empty:
                {'forest':forest_areas,'field':field_areas,'grass':grass_areas}[kind].append(geom)
                count[kind+'_areas']+=1
        elif (kind=='building' and s.buildings) or (kind=='landmark' and s.landmarks):
            if geom.geom_type not in ('Polygon','MultiPolygon'): continue
            if kind=='building':
                minimum=max(s.building_min_width,2*s.nozzle)
                # Check each footprint separately; multipolygons can contain tiny outbuildings.
                adjusted=[]
                for footprint in ([geom] if isinstance(geom,Polygon) else geom.geoms):
                    if footprint.is_empty or footprint.area <= 0:
                        count['skipped_invalid_features']+=1
                        continue
                    with np.errstate(divide="ignore", invalid="ignore"):
                        rectangle=footprint.minimum_rotated_rectangle
                    if not isinstance(rectangle,Polygon):
                        count['skipped_invalid_features']+=1
                        continue
                    coords=list(rectangle.exterior.coords)
                    width=min(math.dist(coords[i],coords[i+1]) for i in range(4))
                    if width < minimum:
                        if s.small_buildings=='omit':
                            count['omitted_small_buildings']+=1
                            continue
                        if s.small_buildings=='enhance':
                            original_footprint=footprint
                            footprint=footprint.buffer((minimum-width)/2,join_style=2)
                            if s.preserve_building_gaps and not tags.get('building:part'):
                                gap=2*s.nozzle
                                nearby=[source_buildings[int(i)] for i in building_index.query(footprint.buffer(gap))
                                        if not source_buildings[int(i)].intersects(original_footprint)]
                                forbidden=unary_union([g.buffer(gap,join_style=2) for g in nearby]).union(street_clearance.difference(original_footprint))
                                safe=footprint.difference(forbidden).union(original_footprint)
                                # Do not produce thin growth slivers beside dense neighbours.
                                # Retain the mapped outline where full printable widening cannot fit.
                                if not safe.equals(footprint):
                                    footprint=original_footprint
                                    constrained_buildings+=1
                                    if width < 2*s.nozzle:
                                        count['omitted_small_buildings']+=1
                                        continue
                            count['enhanced_buildings']+=1
                    adjusted.append(footprint)
                geom=unary_union(adjusted)
                if geom.is_empty: continue
            geom=printable_footprint(geom.buffer(0.03,join_style=2)).intersection(map_clip)
            if not isinstance(geom,(Polygon,MultiPolygon)):
                geom=unary_union([p for p in getattr(geom,'geoms',[]) if isinstance(p,Polygon)])
            if geom.is_empty: continue
            points=[geom.representative_point().coords[0]]
            polys=[geom] if isinstance(geom,Polygon) else list(geom.geoms)
            for poly in polys: points.extend(poly.exterior.coords)
            fallback=fallback_height(tags,s.building_height) if s.building_type_heights else s.building_height
            real_h=source_height(tags,fallback)
            if s.building_style!='uniform' and s.building_type_heights and source_height(tags,0)==0 and fallback!=s.building_height:
                typed_heights+=1
            if s.building_style=='uniform' and not tags.get('_custom_id'): real_h=s.building_height
            relief=max(s.building_min_height,real_h*geo.scale*s.building_exaggeration)
            top=float(max(sample(points)))+relief
            if not math.isfinite(top) or top > s.printer_z:
                raise ValueError('Building dimensions exceed the printer height. Reduce the building height multiplier or minimum height.')
            roof = mapped_roof(geom,tags,top-relief,relief,real_h) if s.building_style=='realistic' else None
            buildings.append(roof if roof is not None else prism(geom,top))
            if kind=='building':
                count['mapped_parts']+=bool(tags.get('building:part'))
                count['mapped_roofs']+=roof is not None
                count['unmodelled_roofs']+=bool(tags.get('roof:shape') not in (None,'flat') and roof is None and s.building_style=='realistic')
                count['source_height_buildings' if source_height(tags,0)>0 else 'fallback_height_buildings']+=1
            if s.building_style=='stepped':
                roof=geom.buffer(-min(0.5,math.sqrt(geom.area)/8))
                if not roof.is_empty:
                    top+=relief*0.3
                    if not math.isfinite(top) or top > s.printer_z:
                        raise ValueError('Stepped building roofs exceed the printer height. Reduce the building height multiplier.')
                    buildings.append(prism(roof,top))
            building_tops.append((geom,top))
            limit=max(limit,top+1)
            count['buildings' if kind=='building' else 'landmarks']+=1
    progress(40,'Draping roads and cutting recessed water across the full artwork')
    road_shape=printable_footprint(unary_union(roads))
    road_area=road_shape.intersection(map_clip)
    water_area=unary_union(waters).intersection(map_clip)
    forest_area=unary_union(forest_areas)
    field_area=unary_union(field_areas)
    road_added=md.Manifold()
    if roads:
        road_mask=prism(road_shape,limit)
        if s.roads=='raised':
            raised=original.translate((0,0,s.road_height))^road_mask
            if s.multicolour: road_added=raised
            terrain=terrain+raised
        else: terrain=terrain-((original-original.translate((0,0,-s.road_height)))^road_mask)
    if waters:
        progress(42,'Shaping river and lake beds')
        water_mask=prism(unary_union(waters),limit)
        if s.water_style=='carved':
            bed=original.translate((0,0,-s.water_depth))
            # Preserve the original default carving exactly.
            terrain=terrain-((original.translate((0,0,max(s.road_height,0)+0.05))-bed)^water_mask)
        else:
            sigma=max(1,min(6,s.water_width/max(xs[1]-xs[0],ys[1]-ys[0])))
            bed_z=np.maximum(s.base,np.minimum(z-s.water_depth,gaussian_filter(z,sigma)-s.water_depth))
            bed=terrain_solid(xs,ys,bed_z)
            terrain=terrain-((terrain-bed)^water_mask)
            warnings.append('Smooth water follows broad terrain slopes; it is a smoothed printable channel bed, not a hydrological water-level simulation.')
        if s.water_bank:
            progress(44,'Tapering river and lake banks')
            # Nested tapered cuts produce small printable bank transitions.
            bank_cuts=[]
            for band in range(1,4):
                fraction=band/4
                area=water_area.buffer(s.water_bank*fraction).intersection(map_clip)
                bank_bed=original.translate((0,0,-s.water_depth*(1-fraction)))
                # Remove raised road caps as well as terrain at the bank.
                # Otherwise the cut leaves unsupported roofs over air slots.
                # Cut the complete column above the intended bed. Intersecting
                # two translated terrace skins leaves zero-thickness opposing
                # walls where contour levels and bank bands meet.
                bank_cuts.append(prism(area,limit)-bank_bed)
            terrain=terrain-union(bank_cuts)
    # New detail is built from the original terrain column, so no rails,
    # sleepers or decks float above an engraved road or a carved channel.
    obstacle=unary_union([water_area.buffer(s.water_bank+.05),
                          *[g.buffer(.05) for g,_ in building_tops]])
    bridge_area=unary_union([a for _,a in bridge_plans]).intersection(map_clip)
    rail_area=printable_footprint(rail_area.difference(obstacle).union(
        rail_area.intersection(bridge_area).difference(unary_union([g for g,_ in building_tops])))).intersection(map_clip)
    rail_detail=rail_detail.intersection(rail_area)
    park_area=printable_footprint(unary_union(parks).difference(unary_union([
        road_area.buffer(.1),rail_area.buffer(.1),obstacle]))).intersection(map_clip)
    hardscape_area=printable_footprint(unary_union(hardscapes).difference(unary_union([
        road_area.buffer(.1),rail_area.buffer(.1),park_area,obstacle]))).intersection(map_clip)
    park_area=printable_footprint(printable_area(park_area,s.nozzle)).intersection(map_clip)
    hardscape_area=printable_footprint(printable_area(hardscape_area,s.nozzle)).intersection(map_clip)
    for area,rise in [(park_area,.2),(hardscape_area,.2),(rail_area,s.railway_height),
                      (rail_detail,s.railway_height+.2)]:
        if area.is_empty: continue
        addition=original.translate((0,0,rise))^prism(area,limit)
        if addition.bounding_box()[5]>s.printer_z:
            raise ValueError('Landscape details exceed printer height. Reduce terrain or railway rise.')
        terrain=terrain+addition
    lower_routes=unary_union([g for kind,g,tags in features
        if ((kind=='road' and s.roads!='none') or (kind=='railway' and s.railways))
        and not enabled_tag(tags,'bridge')])
    opening_cuts=[]; opening_count=0; inferred_openings=0
    approach_terrain=terrain
    for line,area in bridge_plans:
        area=printable_footprint(area.difference(unary_union([g for g,_ in building_tops]))).intersection(map_clip)
        if area.is_empty: continue
        # Start with a filled column. Optional openings remove only a small
        # curved arch, retaining solid piers, a flat base and a thick deck.
        points=list(area.exterior.coords) if isinstance(area,Polygon) else [p for g in area.geoms for p in g.exterior.coords]
        points.extend(line.coords if line.geom_type=='LineString' else [])
        top=float(max(sample(points)))+max(s.road_height,s.railway_height)
        plans=bridge_opening_plan(line,area,water_area,lower_routes,s.nozzle) if s.bridge_openings else []
        cuts=[]
        for plan in plans:
            if not map_clip.buffer(-2*s.nozzle).covers(plan['footprint']): continue
            if plan['footprint'].intersects(unary_union([g for g,_ in building_tops])): continue
            # Use the finished channel/route surface, not the original DEM:
            # river mouths should reach their bed rather than sit above it.
            # Query every mouth corner so neither end becomes a buried void.
            mouth_heights=[]
            for x,y in plan['mouth_points']:
                hits=approach_terrain.ray_cast((x,y,limit+1),(x,y,-1))
                if hits: mouth_heights.append(hits[0].position[2])
            if len(mouth_heights)!=len(plan['mouth_points']): continue
            floor=max(s.base,max(mouth_heights))+.05
            profile=bridge_arch_profile(plan['width'])
            arch_height=max(y for _,y in profile)
            roof=max(.8,2*s.nozzle)
            required=floor+arch_height+roof
            if required>s.printer_z: continue
            top=max(top,required)
            arch=md.CrossSection([np.array(profile)])
            cut=arch.extrude(plan['hi']-plan['lo']).rotate((90,0,0)).translate((0,plan['hi'],floor))
            cut=cut.rotate((0,0,plan['angle'])).translate((plan['x'],plan['y'],0))
            cuts.append(cut); opening_count+=1; inferred_openings+=int(plan['inferred'])
        if top>s.printer_z: raise ValueError('Supported crossing exceeds printer height.')
        terrain=terrain+prism(area,top)
        opening_cuts.extend(cuts)
    # Subtract after every bridge is added so overlapping crossing masks do
    # not accidentally refill an earlier opening.
    terrain=terrain-union(opening_cuts)
    road_area=road_area.union(rail_area).union(hardscape_area).union(bridge_area).intersection(map_clip)
    count.update(rail_counts,parks=len(parks),hardscapes=len(hardscapes),supported_crossings=len(bridge_plans),
                 bridge_openings=opening_count,inferred_bridge_openings=inferred_openings,
                 omitted_tunnel_roads=tunnel_count,gap_preserved_buildings=constrained_buildings,type_height_estimates=typed_heights)
    if s.railways:
        warnings.append(f"Railways: {rail_counts['railways']} mapped track sections; {rail_counts['rail_simplified_lines']} simplified to supported track beds at this scale. Rails and sleepers use at least two nozzle widths and share the roads filament.")
        if rail_counts['sleepers']>=1200: warnings.append('Railway sleeper detail reached the 1,200-piece budget; continuous supported rails and beds are retained.')
    if bridge_plans or tunnel_count:
        warnings.append(f'Crossings: {len(bridge_plans)} simplified relief decks; {opening_count} rounded arch openings with crown bridging spans below 3 mm, including {inferred_openings} inferred at bridge midpoints; {tunnel_count} underground road sections hidden. Opening shape and deck clearance are symbolic, not measured bridge geometry. Small crossings remain filled. Rounded crowns use short bridging: check cooling and bridge settings in the slicer.')
    if constrained_buildings:
        warnings.append(f'{constrained_buildings} small buildings could not be fully widened without closing neighbour gaps; those below two nozzle widths were omitted. Use a closer selection to recover detail.')
    if typed_heights:
        warnings.append(f'{typed_heights} building heights use type-based estimates relative to your fallback height, not measured heights.')
    progress(48,f'Adding {len(buildings)} solid building footprints')
    relief_surface=terrain
    building_solid=union(buildings)
    building_added=building_solid if s.multicolour else md.Manifold()
    if buildings: terrain=terrain+building_solid
    markers=list(s.markers)
    if s.marker:
        from .config import LocationMarker
        markers.append(LocationMarker(id='legacy',label='Custom marker',symbol='pin',lon=s.marker_lon,lat=s.marker_lat,size=3.4,rise=2))
    marker_areas=[affinity.translate(marker_shape(m.symbol,m.size),*geo.point(m.lon,m.lat)) for m in markers]
    if s.forests or s.fields:
        exclusions=unary_union([road_area.buffer(0.2),water_area.buffer(s.water_bank+0.2),
                                *[area.buffer(0.2) for area,_ in building_tops],
                                *[area.buffer(0.2) for area in marker_areas]])
        mapped_added,mapped_footprint,mapped_counts=mapped_tree_geometry(
            features if s.forests else [],exclusions,map_clip,original,s,sample,limit)
        count.update(mapped_counts)
        forest_added,field_added,tree_count,strip_count,texture_warnings,tree_footprint,field_footprint=landcover_geometry(
            forest_area,field_area,exclusions.union(mapped_footprint),original,s,sample,limit)
        forest_added=forest_added+mapped_added
        tree_footprint=tree_footprint.union(mapped_footprint)
        if not field_added.is_empty() and field_added.bounding_box()[5]>s.printer_z:
            raise ValueError('Field texture exceeds the printer height. Reduce field height or terrain exaggeration.')
        terrain=terrain+forest_added+field_added
        count.update(trees=tree_count,field_strips=strip_count)
        warnings.extend(texture_warnings)
    else:
        forest_added=field_added=md.Manifold()
        tree_footprint=field_footprint=Polygon()
    marker_tops=[]
    marker_added=md.Manifold()
    for marker in markers:
        mx,my=geo.point(marker.lon,marker.lat)
        shape=affinity.translate(marker_shape(marker.symbol,marker.size),mx,my)
        if not map_clip.buffer(-0.1).covers(shape):
            raise ValueError(f'Marker “{marker.label}” lies outside the map or too close to its edge. Move it inward or reduce its size.')
        # A solid raised badge remains attached and clears every roof it overlaps.
        points=list(shape.exterior.coords)+[(mx,my)]
        x0,y0,x1,y1=shape.bounds
        local=z[np.ix_((ys>=y0)&(ys<=y1),(xs>=x0)&(xs<=x1))]
        surface=max(float(max(sample(points))),float(local.max()) if local.size else 0)
        floor=max(surface+(s.road_height if s.roads=='raised' else 0),max((top for footprint,top in building_tops if footprint.intersects(shape)),default=0),
                  max((top for footprint,top in marker_tops if footprint.intersects(shape)),default=0))
        top=floor+marker.rise
        if top > s.printer_z:
            raise ValueError(f'Marker “{marker.label}” dimensions exceed the printer height. Reduce its rise or terrain height multiplier.')
        badge=prism(shape,top)
        if s.multicolour: marker_added=marker_added+badge
        terrain=terrain+badge
        limit=max(limit,top+1)
        marker_tops.append((shape,top))
        count['markers']+=1
    # A conservative one-millimetre envelope catches narrow peaks and
    # terrace steps between ring vertices. Bilinear interpolation of this
    # envelope bounds the original triangle planes throughout each segment.
    from shapely.geometry import LineString
    for trail in s.trails:
        line=LineString([geo.point(lon,lat) for lon,lat in trail.points])
        shape=line.buffer(max(trail.width,2*s.nozzle)/2,cap_style=1,join_style=1).intersection(map_clip)
        if shape.is_empty:
            warnings.append(f'Trail {trail.name}: outside this map; no route geometry added.')
            continue
        cutter=prism(shape,s.printer_z+100)
        if trail.style=='raised':
            route=original.translate((0,0,trail.height))^cutter
            terrain=terrain+route
            if s.multicolour:marker_added=marker_added+route
        else:
            terrain=terrain-((original-original.translate((0,0,-trail.height)))^cutter)
        count['trails']=count.get('trails',0)+1
    if s.trails:warnings.append('Trails follow the terrain surface; routes are clipped at map edges. Raised trails use the special-places material.')
    profile=None
    if s.frame_mode!='none' and s.frame_contour!='flat':
        envelope=maximum_filter(z,size=(2*math.ceil(1/(ys[1]-ys[0]))+3,
                                         2*math.ceil(1/(xs[1]-xs[0]))+3),mode='nearest')
        def frame_land(points):
            pts=np.asarray(points)
            ix=np.clip((pts[:,0]-xs[0])/(xs[-1]-xs[0])*(nx-1),0,nx-1)
            iy=np.clip((pts[:,1]-ys[0])/(ys[-1]-ys[0])*(ny-1),0,ny-1)
            return map_coordinates(envelope,[iy,ix],order=1,mode='nearest')
        profile=frame_profile(s,frame_land)
    frame=frame_solid(s,profile) if s.frame_mode!='none' else md.Manifold()
    frame_range=([s.frame_depth+s.frame_height]*2 if s.frame_mode!='none' else None)
    if profile is not None:
        heights=profile(frame_loops(s,True)[2])
        frame_range=[float(heights.min()),float(heights.max())]
    if s.front_caption and s.frame_mode!='none':
        b=s.bounds
        lat,lon=(b.north+b.south)/2,((b.west+longitude_span(b.west,b.east)/2+180)%360-180)
        text=f"{s.name.upper()} · {abs(lat):.4f}° {'N' if lat>=0 else 'S'}  {abs(lon):.4f}° {'E' if lon>=0 else 'W'}"
        # Place the caption on the remaining flat front face, never across
        # the inward-facing bevel. Narrow profiles reduce lettering size.
        flat_width=s.frame_width-s.inner_bevel-s.outer_bevel
        caption_y=(s.outer_bevel+s.frame_width-s.inner_bevel)/2
        shape=affinity.translate(text_shape(text,s.width-30,min(3,flat_width*0.65)),s.width/2,caption_y)
        if profile is None:
            frame=frame+prism(shape,0.6,s.frame_depth+s.frame_height-0.05)
        else:
            # Match the front rail's piecewise linear top, including bevels.
            front=frame_top_sample(s,profile)
            caption=prism(shape,0.6).warp(lambda p: (p[0],p[1],p[2]+front(p[0],p[1])-0.05))
            frame=frame+caption
    frame_fit=None
    if s.frame_mode=='separate':
        # One constant footprint keeps terrain, buildings and texture inside
        # a vertical perimeter instead of tracing the frame's bevel at each
        # height. A matching 45-degree rear chamfer seats on the support lip
        # and prints rear-down without a horizontal cantilever or supports.
        insert=frame_insert_footprint(s).buffer(-s.tolerance,join_style=2)
        below_seat=prism(map_clip,FRAME_LIP_HEIGHT)-frame_chamfer_core(s)
        terrain=(terrain^prism(insert,limit+1))-below_seat
        frame_fit={'lip_width_mm':FRAME_LIP_WIDTH,'lip_height_mm':FRAME_LIP_HEIGHT,
                   'clearance_mm':s.tolerance,'seat_angle_degrees':45,'assembly':'chamfered-insert'}
    whole=fill_enclosed_voids(terrain+frame)
    if s.frame_mode=='separate':
        terrain=fill_enclosed_voids(terrain)
        frame=fill_enclosed_voids(frame)
    cols,rows=s.tile_layout()
    tw,th=s.width/cols,s.height/rows
    joints=[]
    if s.joints:
        for col in range(1,cols):
            for row in range(rows):
                for f in (0.3,0.7): joints.append({'x':col*tw,'y':(row+f)*th,'angle':0,'kind':'tile'})
        for row in range(1,rows):
            for col in range(cols):
                for f in (0.3,0.7): joints.append({'x':(col+f)*tw,'y':row*th,'angle':90,'kind':'tile'})
        if s.frame_mode=='separate':
            if s.frame_width < 6:
                raise ValueError('Separate frames with joining keys require a frame width of at least 6 mm.')
            # Bridge the inside end of the shelf and the full-thickness rear
            # of the insert, rather than the now-rebated wall contact.
            fw=s.frame_width+FRAME_LIP_WIDTH
            for col in range(cols):
                x=(col+0.5)*tw
                for y in (fw,s.height-fw): joints.append({'x':x,'y':y,'angle':90,'kind':'frame'})
            for row in range(rows):
                y=(row+0.5)*th
                for x in (fw,s.width-fw): joints.append({'x':x,'y':y,'angle':0,'kind':'frame'})
        pockets=[]
        for j in joints:
            shape=affinity.translate(affinity.rotate(key_shape(s.tolerance),j['angle'],origin=(0,0)),j['x'],j['y'])
            pockets.append(prism(shape,1.9,-0.1))
        holes=union(pockets)
        whole=whole-holes
        terrain=terrain-holes
        frame=frame-holes
    material_sources={}
    if s.multicolour:
        progress(55,'Separating printable colour surfaces')
        # An independently sampled, conservative heightfield follows hills
        # without coincident triangulation at every original channel edge.
        # Each coarse vertex uses the lowest source height in its surrounding
        # cells, so interpolated core triangles stay below the visible relief.
        core_z=minimum_filter(z,size=5,mode='nearest')
        iy=np.unique(np.r_[np.arange(0,len(ys),2),len(ys)-1])
        ix=np.unique(np.r_[np.arange(0,len(xs),2),len(xs)-1])
        recess=max(s.water_depth if waters else 0,
                   s.road_height if roads and s.roads=='engraved' else 0)
        if waters and s.water_style=='smooth':
            recess=max(recess,float(np.max(z-bed_z)))
        # Flat caps need no numerical allowance: preserve the requested
        # layer depth exactly. Uneven terrain retains the conservative gap.
        core_clearance=0.0 if float(np.ptp(z)) < 1e-9 else 0.01
        colour_base=terrain_solid(xs[ix],ys[iy],np.maximum(.05,core_z[np.ix_(iy,ix)]
                                 -s.colour_depth-recess-core_clearance))
        if s.terrain_style=='faceted':
            # Facets are already coarse; another min-filter would bury
            # unnecessary colour beneath their deliberately broad triangles.
            colour_base=original.translate((0,0,-s.colour_depth-recess-core_clearance))
        # Retain the proven level core for tiles whose following boundaries
        # cannot survive binary STL precision. Never weaken export validation.
        colour_floor=s.base+reserve
        if waters:
            colour_floor=min(colour_floor,float(bed_z.min()) if s.water_style=='smooth'
                             else s.base+reserve-s.water_depth)
        if roads and s.roads=='engraved':
            colour_floor=min(colour_floor,s.base+reserve-s.road_height)
        flat_colour_base=prism(map_clip,colour_floor).translate((0,0,-s.colour_depth))
        for name,area in [('water',water_area),('roads',road_area),
                          ('forest',forest_area.union(park_area)),('fields',field_area),
                          ('buildings',unary_union([a for a,_ in building_tops])),
                          ('markers',unary_union(marker_areas))]:
            if name=='water': area=area.buffer(-0.005)
            if name=='buildings':
                # Fully cover the physical roof/wall footprint after mask
                # snapping; a cut just inside a wall leaves an unprintable
                # sliver of ground running up the building.
                area=area.buffer(0.01,join_style=2)
            if name=='roads' and not water_area.is_empty:
                # The channel cuts raised roads away. Do not colour that
                # removed road column or its coincident channel-wall skin.
                area=area.difference(water_area.buffer(s.water_bank*0.75+0.005).difference(bridge_area.buffer(.01)))
            if name=='roads':
                # A finite inset keeps colour boundaries away from the
                # draped cap wall and higher-priority building/marker walls.
                area=area.difference(unary_union([
                    *[a.buffer(0.01) for a,_ in building_tops],
                    *[a.buffer(0.01) for a in marker_areas]])).buffer(-0.05)
            if name in ('forest','fields'):
                # Avoid coincident colour boundaries where source polygons
                # meet frame or recessed channel walls. The narrow transition
                # belongs to the ground core; the parent geometry is unchanged.
                area=area.buffer(-0.005).difference(unary_union([
                    road_area.buffer(0.005),water_area.buffer(s.water_bank+0.005),
                    *[a.buffer(0.005) for a,_ in building_tops],
                    *[a.buffer(0.005) for a in marker_areas]]))
                if name=='fields': area=area.difference(forest_area.buffer(0.005))
                # Include crowns and ridge interiors near source edges,
                # keeping paint cuts inside the draped ridge walls.
                area=area.union(tree_footprint if name=='forest' else field_footprint.buffer(-0.05))
            area=area.intersection(map_clip.buffer(-0.005))
            # A positive paint overlap joins source corner contacts inside
            # the unchanged parent; priority resolves the microscopic overlap.
            area=printable_footprint(area)
            if not area.is_empty: material_sources[name]=area
    progress(58,'Cutting the finished solid into printable tiles')
    parts=[]
    for row in range(rows):
        for col in range(cols):
            ident=tile_id(row,col)
            x0,x1=col*tw,(col+1)*tw
            y0,y1=s.height-(row+1)*th,s.height-row*th
            left=x0+(s.seam/2 if col else 0)
            right=x1-(s.seam/2 if col<cols-1 else 0)
            bottom=y0+(s.seam/2 if row<rows-1 else 0)
            top=y1-(s.seam/2 if row else 0)
            cutter=md.Manifold.cube((right-left,top-bottom,limit+1)).translate((left,bottom,0))
            neighbours={'north':tile_id(row-1,col) if row else None,'east':tile_id(row,col+1) if col<cols-1 else None,
                        'south':tile_id(row+1,col) if row<rows-1 else None,'west':tile_id(row,col-1) if col else None}
            part=(terrain if s.frame_mode=='separate' else whole)^cutter
            label_bounds=(max(left,geo.inset),max(bottom,geo.inset),min(right,s.width-geo.inset),min(top,s.height-geo.inset))
            if s.labels: part=label_tile(part,s,ident,label_bounds,neighbours)
            # A section can detach a zero-volume contour/channel tangent that
            # was still connected in the global model. Resolve it before print
            # validation and semantic material partitioning, preserving every
            # component with printable volume.
            part=fill_enclosed_voids(part)
            record={'id':ident,'kind':'terrain','solid':part,'row':row,'column':col,'neighbours':neighbours,'cut_bounds':[left,bottom,right,top]}
            if s.multicolour:
                progress(58,f'Partitioning colour volumes for tile {ident} of {cols*rows}')
                local_core=colour_base^cutter
                # Keep the internal core off the exact frame-wall plane;
                # the uncoloured skin supplies this microscopic edge column.
                local_core=local_core^prism(map_clip.buffer(-0.001),limit+1)
                # The remainder already contains the finished surface above
                # its lower core. Simple footprint masks split each boundary
                # once and capture complete roofs, crowns and ridges.
                material_candidates={name:(lambda area=area:
                    prism(area.intersection(box(left,bottom,right,top)),limit+1))
                    for name,area in material_sources.items()}
                if s.frame_mode!='separate':
                    material_candidates['frame']=lambda:frame^cutter
                record['material_regions']=material_partition(part,material_candidates,
                    lambda step:progress(58,f'Tile {ident}: {step}'),core=local_core)
                record['colour_core']='surface-following'
                origin=as_trimesh(part).bounds[0]
                try:
                    for region in record['material_regions'].values():
                        as_trimesh(region,ensure_stl=True,stl_origin=origin)
                except ValueError:
                    record['material_regions']=material_partition(part,material_candidates,
                        core=(flat_colour_base^cutter)^prism(map_clip.buffer(-0.001),limit+1))
                    record['colour_core']='level-fallback'
                    warnings.append(f'Tile {ident} uses a deeper, level colour core because surface-following boundaries failed STL precision checks. Its colour regions still undergo full export validation.')
            parts.append(record)
            if s.frame_mode=='separate':
                frame_part=frame^cutter
                # Every disconnected bar is its own print file.
                for idx,piece in enumerate(frame_part.decompose()):
                    record={'id':f'Frame_{ident}_{idx+1}','kind':'frame','solid':piece,'row':row,'column':col,'neighbours':{},'cut_bounds':[left,bottom,right,top]}
                    if s.multicolour: record['material_regions']={'frame':piece}
                    parts.append(record)
    if s.joints and joints:
        parts.append({'id':'Joining_key','kind':'key','solid':prism(key_shape(),1.6),'quantity':len(joints),'neighbours':{}})
    if count['omitted_small_buildings']:
        warnings.append(f"Omitted {count['omitted_small_buildings']} building footprints below the configured minimum width.")
    if count['enhanced_buildings']:
        warnings.append(f"Widened {count['enhanced_buildings']} small building footprints for visibility; nearby buildings may merge unless gap preservation is enabled.")
    if s.buildings and osm_meta.get('buildings'):
        coverage=osm_meta['buildings']
        warnings.append(f'Building coverage: {coverage["osm_buildings"]:,} OpenStreetMap buildings plus '
                        f'{coverage["added_buildings"]:,} additional Overture outlines. '
                        'Imagery-derived outlines and heights are estimates; coverage is not guaranteed to be complete.')
    elif s.buildings:
        warnings.append('Building coverage depends on OpenStreetMap. Missing source footprints cannot be recovered by increasing detail.')
    if dem_meta.get('warning'): warnings.append(dem_meta['warning'])
    if s.buildings:
        warnings.append(f"City detail: {count['mapped_parts']} mapped building parts and {count['mapped_roofs']} source-tagged roofs. {count['fallback_height_buildings']} buildings use the configured fallback height. Raised or floating parts are grounded for printable relief.")
        if count['unmodelled_roofs']:
            warnings.append(f"{count['unmodelled_roofs']} roofs have unsupported shapes or missing roof heights; source-height blocks are used for these roofs.")
    if s.roads!='none' and s.road_width < 2*s.nozzle:
        warnings.append(f'Roads are {s.road_width:g} mm wide: less than two {s.nozzle:g} mm nozzle widths. Increase road width for reliable features.')
    if s.water and s.water_width < 2*s.nozzle:
        warnings.append('Some water channels are narrower than two nozzle widths. Increase water width if the slicer loses them.')
    if s.labels:
        warnings.append('Rear lettering may contain single-extrusion strokes; check readability in your slicer, especially with a nozzle larger than 0.4 mm.')
    warnings.append('Minimum feature checks are conservative design checks, not a complete wall-thickness analysis. Inspect thin building details in your slicer.')
    if joints:
        warnings.append('Rear registration pockets are 1.8 mm deep: short bridges are required. Check them in the slicer and print the fit coupons and one key first.')
    if s.labels:
        warnings.append('Rear label recesses are 0.7 mm deep: short bridges are required. Check the lettering in the slicer.')
    if s.forests or s.fields or s.multicolour:
        warnings.append('Forest, field and grass regions use OpenStreetMap land-cover polygons. Coverage and boundaries depend on source mapping; individual printable trees are illustrative, not surveyed tree positions.')
    if s.multicolour:
        warnings.append(f'Colour follows a conservative terrain core with a minimum {s.colour_depth:g} mm surface depth. Recess clearance, slopes and terrace risers can thicken the colour layer; raised details retain their colour. The core uses the ground colour. Slice to check actual filament changes and opacity.')
    if s.forests and not forest_areas:
        warnings.append('No mapped forest or woodland polygons were found; only available mapped trees, rows and canopy patches are included.')
    elif s.forests and not count['trees']:
        warnings.append('Mapped woodland is present, but no tree shapes fit the selected crown size, spacing and feature clearances. Reduce tree size or spacing, or increase artwork size.')
    if s.forests:
        warnings.append('Individual mapped trees retain OpenStreetMap positions with stylised crowns. Tree rows use a printable strip width; canopy patches retain source cover, without invented trunk positions.')
        if count['omitted_tree_details']:
            warnings.append(f"Omitted {count['omitted_tree_details']} mapped tree details due to print size, overlap, edge clearance or the tree limit; no positions were moved.")
    if s.fields and not field_areas:
        warnings.append('No mapped farmland polygons were found in this area; no field texture was added.')
    if count['skipped_invalid_features']:
        warnings.append(f"Skipped {count['skipped_invalid_features']} invalid building footprints from the source data.")
    if s.seam: warnings.append(f'{s.seam:.2f} mm seam gaps intentionally remove a narrow strip of geography at internal boundaries.')
    return parts,{'geometry_revision':GEOMETRY_REVISION,'frame_fit':frame_fit,
                  'colour_method':'surface-core-v1' if s.multicolour else None,
                  'custom_buildings':custom_count,'city_method':'mapped-parts-roofs-v1','dem':dem_meta,'osm':osm_meta,'features':count,'warnings':warnings,'joints':joints,
                  'land_height_mm':[float(z.min()),float(z.max())],'frame_height_mm':frame_range,
                  'elevation_m':[float(dem.min()),float(dem.max())],'ground_dimensions_m':[geo.ground_width,geo.ground_height],
                  'scale_mm_per_m':geo.scale,'grid':[nx,ny],'grid_spacing_mm':[float(xs[1]-xs[0]),float(ys[1]-ys[0])],
                  'terrain_method':'contour-bands' if s.terrain_style == 'terraced' else 'heightfield',
                  'columns':cols,'rows':rows,'whole_volume_mm3':whole.volume()}
