"""Printable collections and deterministic puzzle boundaries, in assembled mm."""
import math
from shapely.geometry import box, Polygon, Point
from shapely import affinity


def cells(s):
    edge, gap = s.tile_size, s.tile_gap
    positions=s.wall_positions or [(r,c) for r in range(s.collection_rows) for c in range(s.collection_columns)]
    for row,col in positions:
        if s.map_format == 'hexagons':
            pitch_x=edge*.75+(math.sqrt(3)/2*gap if s.wall_mode!='legacy' else gap)
            cx=s.frame_width+edge/2+col*pitch_x
            cy=s.frame_width+edge*math.sqrt(3)/4+row*(edge*math.sqrt(3)/2+gap)+(col%2)*(edge*math.sqrt(3)/4+gap/2)
            shape=Polygon([(cx+edge/2*math.cos(i*math.pi/3),cy+edge/2*math.sin(i*math.pi/3)) for i in range(6)])
        else:
            cx=s.frame_width+edge/2+col*(edge+gap);cy=s.frame_width+edge/2+row*(edge+gap)
            shape=box(cx-edge/2,cy-edge/2,cx+edge/2,cy+edge/2)
        yield row,col,shape


def collection_size(s):
    shapes=[p for _,_,p in cells(s)]
    return max(p.bounds[2] for p in shapes)+s.frame_width,max(p.bounds[3] for p in shapes)+s.frame_width


def magnet_centres(shape):
    x,y=shape.centroid.coords[0]; w=shape.bounds[2]-shape.bounds[0]
    return [(x-w*.23,y),(x+w*.23,y)]


def pockets(shape,s,bottom):
    from .geometry import prism, union
    return union([prism(Point(x,y).buffer((s.magnet_diameter+s.magnet_clearance)/2,quad_segs=24),s.magnet_depth+s.magnet_clearance,bottom) for x,y in magnet_centres(shape)])


ROUND_TAB = .14
ROUND_SHIFT = .8


def puzzle_shapes(width,height,columns,rows,clearance,tab_ratio=ROUND_TAB,style="rounded",seed=1):
    """Shared boundaries, so each knob has exactly one matching socket.

    Round knobs sit 0.8 radii beyond the seam: the neck is 60% of the head, so
    neighbouring pieces cannot slide apart in the plane of the puzzle.
    """
    if style == "classic":
        return classic_puzzle_shapes(width,height,columns,rows,clearance,seed)
    tw,th=width/columns,height/rows
    result={(r,c):box(c*tw,r*th,(c+1)*tw,(r+1)*th) for r in range(rows) for c in range(columns)}
    radius=min(tw,th)*tab_ratio
    for r in range(rows):
        for c in range(columns-1):
            x=(c+1)*tw;y=(r+.5)*th
            a,b=((r,c),(r,c+1)) if (r+c)%2==0 else ((r,c+1),(r,c))
            shift=radius*ROUND_SHIFT if a==(r,c) else -radius*ROUND_SHIFT
            tab=Point(x+shift,y).buffer(radius,quad_segs=24)
            result[a]=result[a].union(tab);result[b]=result[b].difference(tab)
    for r in range(rows-1):
        for c in range(columns):
            x=(c+.5)*tw;y=(r+1)*th
            a,b=((r,c),(r+1,c)) if (r+c)%2==0 else ((r+1,c),(r,c))
            shift=radius*ROUND_SHIFT if a==(r,c) else -radius*ROUND_SHIFT
            tab=Point(x,y+shift).buffer(radius,quad_segs=24)
            result[a]=result[a].union(tab);result[b]=result[b].difference(tab)
    return [(r,c,p.buffer(-clearance/2,join_style=2)) for (r,c),p in result.items()]


def puzzle_reach(tw,th,style):
    """How far a knob extends beyond a piece's grid cell, in mm."""
    size=min(tw,th)
    return size*(ROUND_TAB*(1+ROUND_SHIFT) if style=='rounded' else .14*1.5+CORNER_JITTER)


def puzzle_edge(length, size, axis, row, col, seed):
    """Sample the same seeded Bezier connector used by the editor preview."""
    value=(seed*97+(row+1)*193+(col+1)*389+axis*769)%65521
    centre=length*(.42+(value%17)/100)
    scale=size*(.125+((value//17)%4)*.005)
    sign=1 if (value//68)%2 else -1
    curves=[((-1.5,0),(-.9,0),(-.35,.08),(-.45,.3)),
            ((-.45,.3),(-.55,.55),(-.9,.7),(-.85,1.05)),
            ((-.85,1.05),(-.8,1.85),(.8,1.85),(.85,1.05)),
            ((.85,1.05),(.9,.7),(.55,.55),(.45,.3)),
            ((.45,.3),(.35,.08),(.9,0),(1.5,0))]
    points=[(0,0),(centre-1.5*scale,0)]
    for a,b,c,d in curves:
        for i in range(1,13):
            t=i/12;u=1-t
            x=u**3*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t**3*d[0]
            y=u**3*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t**3*d[1]
            points.append((centre+x*scale,sign*y*scale))
    return points+[(length,0)]


CORNER_JITTER = .05


def puzzle_corner(row, col, columns, rows, tw, th, seed):
    """Interior grid crossings wander by up to 5% of a piece; the outer edge stays straight."""
    x,y=col*tw,row*th
    if 0<col<columns and 0<row<rows:
        value=(seed*131+(row+1)*557+(col+1)*811)%65521
        size=min(tw,th)
        x+=((value%41)/20-1)*CORNER_JITTER*size
        y+=(((value//41)%41)/20-1)*CORNER_JITTER*size
    return x,y


def puzzle_boundary(a, b, edge, length):
    """Lay an edge sampled along (0,0)-(length,0) between two wandering corners."""
    dx,dy=b[0]-a[0],b[1]-a[1]
    actual=math.hypot(dx,dy);ux,uy=dx/actual,dy/actual
    return [(a[0]+ux*u*actual/length-uy*v,a[1]+uy*u*actual/length+ux*v) for u,v in edge]


def classic_puzzle_shapes(width,height,columns,rows,clearance,seed):
    tw,th=width/columns,height/rows;size=min(tw,th)
    corner=lambda r,c:puzzle_corner(r,c,columns,rows,tw,th,seed)
    horizontal={};vertical={}
    for r in range(rows+1):
        for c in range(columns):
            edge=[(0,0),(tw,0)] if r in (0,rows) else puzzle_edge(tw,size,0,r,c,seed)
            horizontal[r,c]=puzzle_boundary(corner(r,c),corner(r,c+1),edge,tw)
    for r in range(rows):
        for c in range(columns+1):
            edge=[(0,0),(th,0)] if c in (0,columns) else puzzle_edge(th,size,1,r,c,seed)
            # Vertical edges run upwards; their knobs point along -x for a positive sign.
            vertical[r,c]=puzzle_boundary(corner(r,c),corner(r+1,c),[(u,-v) for u,v in edge],th)
    return [(r,c,Polygon(horizontal[r,c][:-1]+vertical[r,c+1][:-1]+list(reversed(horizontal[r+1,c]))[:-1]+list(reversed(vertical[r,c]))[:-1]).buffer(-clearance/2,join_style=2))
            for r in range(rows) for c in range(columns)]


def record(ident,kind,solid,row=0,col=0,regions=None):
    p={'id':ident,'kind':kind,'solid':solid,'row':row,'column':col,'neighbours':{}}
    if regions is not None:p['material_regions']=regions
    return p


def clipped_record(part,shape,ident,row,col,s,ease=0,number=None):
    from .geometry import prism, drop_cut_crumbs, text_shape
    cutter=prism(shape,s.printer_z+100)
    if ease:
        # Two narrow first-layer steps absorb elephant's foot, which would
        # otherwise close a puzzle seam that is only a fraction of a millimetre.
        cutter=prism(shape.buffer(-ease,join_style=2),.2)+prism(shape.buffer(-ease/2,join_style=2),.2,.2)+prism(shape,s.printer_z+100,.4)
    if number:
        minx,miny,maxx,maxy=shape.bounds
        label=text_shape(number,min(maxx-minx,maxy-miny)*.34,5)
        label=affinity.translate(affinity.scale(label,xfact=-1,yfact=1,origin=(0,0)),*shape.representative_point().coords[0])
        if shape.buffer(-3).covers(label.envelope):
            cutter=cutter-prism(label,.41,-.01)
    solid,crumbs=drop_cut_crumbs(part['solid']^cutter,s.nozzle)
    regions={k:v^cutter for k,v in part.get('material_regions',{}).items()}
    if crumbs:regions={k:v^solid for k,v in regions.items()}
    return record(ident,part['kind'],solid,row,col,regions if s.multicolour else None)


PUZZLE_ROAD = .4
PUZZLE_WATER = .6
PUZZLE_BUILDING = .8
PUZZLE_EASE = .25


def puzzle_source(s, width, height):
    """Printable stepped relief for a thin puzzle: every feature is two or more layers."""
    water=PUZZLE_WATER if s.water else 0
    return s.model_copy(update=dict(
        map_format='artwork',artwork_shape='rectangle',artwork_rotation=0,layout='manual',columns=1,rows=1,joints=False,labels=False,
        seam=0,frame_mode='none',front_caption=False,hang_mode='none',width=width,height=height,
        # Land sits 3 mm above the bed; water is cut into that, never below a 2.4 mm floor.
        base=3-max(water,min(s.road_height,PUZZLE_ROAD) if s.roads=='engraved' else 0),
        water_depth=PUZZLE_WATER,water_bank=min(s.water_bank,.6),road_height=PUZZLE_ROAD,railway_height=min(s.railway_height,PUZZLE_ROAD),
        building_style='uniform',building_type_heights=False,building_exaggeration=1e-6,building_min_height=PUZZLE_BUILDING,
        tree_height=min(s.tree_height,PUZZLE_BUILDING),field_height=min(s.field_height,PUZZLE_ROAD),
        markers=[m.model_copy(update=dict(rise=min(m.rise,.6))) for m in s.markers],
        trails=[t.model_copy(update=dict(height=min(t.height,PUZZLE_ROAD))) for t in s.trails]))


def generate_format(s,progress,data_override=None):
    from .geometry import generate_solids, prism, union
    if s.map_format=='jigsaw':
        inset=s.frame_width if s.frame_mode!='none' else 0
        # Generate geography in the inner area, then translate into the surround.
        iw,ih=s.width-2*inset,s.height-2*inset
        source=puzzle_source(s,iw,ih)
        baseline,meta=generate_solids(source,progress,data_override,relief_limit=s.puzzle_relief)
        terrain=next(p for p in baseline if p['kind']=='terrain')
        terrain={**terrain,'solid':terrain['solid'].translate((inset,inset,0)),
                 'material_regions':{k:v.translate((inset,inset,0)) for k,v in terrain.get('material_regions',{}).items()}}
        shapes=puzzle_shapes(iw,ih,s.puzzle_columns,s.puzzle_rows,s.puzzle_clearance,style=s.puzzle_style,seed=s.puzzle_seed)
        parts=[]
        for r,c,shape in shapes:
            p=clipped_record(terrain,affinity.translate(shape,inset,inset),f'Puzzle_{r+1}_{c+1}',r,c,s,ease=PUZZLE_EASE,
                             number=f'{r+1}-{c+1}' if s.labels else None)
            p['assembly_offset_mm']=[0,0,s.frame_depth if inset else 0]
            parts.append(p)
        meta.update(columns=s.puzzle_columns,rows=s.puzzle_rows,joints=[],frame_fit=None,format='jigsaw',mounting=None)
        if inset:
            outer=box(0,0,s.width,s.height);inner=box(inset-s.tolerance,inset-s.tolerance,s.width-inset+s.tolerance,s.height-inset+s.tolerance)
            tray=prism(outer,s.frame_depth)+prism(outer.difference(inner),s.frame_height,s.frame_depth)
            cols,rows=s.tile_layout()
            if s.hang_mode=='keyholes':
                from . import mounting
                seams=[box(c*s.width/cols-6,0,c*s.width/cols+6,s.height) for c in range(1,cols)]
                for x,y in mounting.keyhole_positions(s.width,s.height-inset-22,outer.buffer(-6),seams):
                    tray=tray-mounting.keyhole_cut(x,y)
                meta['mounting']=mounting.describe(s)
                meta['warnings'].append('Tray keyholes: glue the finished puzzle into its tray before hanging; loose pieces will not stay in on a wall.')
            # A tray wider than the bed prints as plates, keyed together underneath.
            from .geometry import key_shape
            joins=[(c*s.width/cols,(r+f)*s.height/rows,0) for c in range(1,cols) for r in range(rows) for f in (.3,.7)]
            joins+=[((c+f)*s.width/cols,r*s.height/rows,90) for r in range(1,rows) for c in range(cols) for f in (.3,.7)]
            if joins:
                tray=tray-union([prism(affinity.translate(affinity.rotate(key_shape(s.tolerance),angle,origin=(0,0)),x,y),1.9,-.1) for x,y,angle in joins])
            parts+=split_holder(tray,s)
            if joins:
                key=record('Tray_key','key',prism(key_shape(),1.6));key['quantity']=len(joins);parts.append(key)
        pieces=[p for p in parts if p['kind']=='terrain']
        meta['whole_volume_mm3']=sum(p['solid'].volume() for p in pieces)
        thickness=max(p['solid'].bounding_box()[5] for p in pieces)
        meta['puzzle_thickness_mm']=round(thickness,2)
        meta['puzzle_pattern']={'style':s.puzzle_style,'seed':s.puzzle_seed}
        meta['warnings'].append(f'Jigsaw: {s.puzzle_columns*s.puzzle_rows} interlocking pieces, up to {thickness:.1f} mm thick. Land rises at most {s.puzzle_relief:g} mm above a 3 mm base; water is cut {PUZZLE_WATER:g} mm, roads stand {PUZZLE_ROAD:g} mm and buildings {PUZZLE_BUILDING:g} mm so each prints as whole layers. Seams have {s.puzzle_clearance:g} mm total clearance and eased bottom edges. Print the Puzzle_Fit pair before the full map.')
        # The coupon is the design's own first pair of neighbours, eased like every piece.
        blank={'kind':'coupon','solid':prism(box(0,0,iw,ih),3)}
        for r,c,p in shapes[:2]:
            fit=clipped_record(blank,p,f'Puzzle_Fit_{c+1}',0,0,s.model_copy(update=dict(multicolour=False)),ease=PUZZLE_EASE)
            fit['neighbours']={};parts.append(fit)
        return parts,meta
    parts=[];metas=[]
    from . import mounting
    footprints=list(cells(s));tray_height=max(s.frame_depth,4 if s.wall_mode!='legacy' else 3,s.magnet_depth+s.magnet_clearance+1.5 if s.mount_mode=='magnets' else 0,mounting.holder_floor(s) if s.wall_mode!='legacy' else 0)
    continuous=s.wall_mode=='continuous'
    shared=None
    if continuous:
        source=s.model_copy(update=dict(map_format='artwork',artwork_shape='rectangle',artwork_rotation=0,width=s.width-2*s.frame_width,height=s.height-2*s.frame_width,frame_mode='none',front_caption=False,joints=False,labels=False,layout='manual',columns=1,rows=1))
        baseline,shared_meta=generate_solids(source,progress,data_override)
        shared=next(p for p in baseline if p['kind']=='terrain')
        shared={**shared,'solid':shared['solid'].translate((s.frame_width,s.frame_width,0)), 'material_regions':{k:v.translate((s.frame_width,s.frame_width,0)) for k,v in shared.get('material_regions',{}).items()}}

    for i,(r,c,shape) in enumerate(footprints):
        tile=s.map_tiles[i] if i<len(s.map_tiles) else None
        bounds=tile.bounds if tile else s.bounds;name=s.name if continuous else tile.name if tile else s.name
        minx,miny,maxx,maxy=shape.bounds;w=maxx-minx;h=maxy-miny
        source=s.model_copy(update=dict(map_format='artwork',artwork_shape='rectangle',artwork_rotation=0,name=name,bounds=bounds,width=w,height=h,frame_mode='none',front_caption=False,joints=False,labels=False,layout='manual',columns=1,rows=1,markers=tile.markers if tile else s.markers,trails=tile.trails if tile else s.trails,custom_buildings=tile.custom_buildings if tile else s.custom_buildings,reference_image=None))
        def report(percent,message):progress(5+int((i+percent/100)*50/len(footprints)),f'Tile {i+1}/{len(footprints)} · {message}')
        if continuous:
            t=shared;meta=shared_meta
        else:
            baseline,meta=generate_solids(source,report,data_override)
            t=next(p for p in baseline if p['kind']=='terrain')
            t={**t,'solid':t['solid'].translate((minx,miny,0)), 'material_regions':{k:v.translate((minx,miny,0)) for k,v in t.get('material_regions',{}).items()}}
        metas.append(meta)
        p=clipped_record(t,shape.buffer(-s.tolerance/2,join_style=2),f'Map_{r+1}_{c+1}',r,c,s)
        if s.mount_mode=='magnets':
            holes=pockets(shape,s,-.01)
            p['solid']=p['solid']-holes
            if s.multicolour:p['material_regions']={k:v-holes for k,v in p['material_regions'].items()}
        # Keep printable STLs rear-down; assembly metadata positions tiles above holders.
        p['assembly_offset_mm']=[0,0,tray_height] if s.frame_mode!='none' else [0,0,0]
        p['map_name']=name;parts.append(p)
    if s.frame_mode!='none':
        if s.wall_mode!='legacy':
            parts+=modular_holders(footprints,s,tray_height)
        elif s.map_format=='hexagons':
            for r,c,shape in footprints:
                outer=shape.buffer(s.tile_gap/2,join_style=2);inner=shape.buffer(s.tolerance/2,join_style=2)
                holder=prism(outer,tray_height)+prism(outer.difference(inner),s.frame_height,tray_height)
                if s.mount_mode=='magnets':holder=holder-pockets(shape,s,tray_height-s.magnet_depth-s.magnet_clearance)
                parts.append(record(f'Holder_{r+1}_{c+1}','frame',holder,r,c,{'frame':holder} if s.multicolour else None))
        else:
            outer=box(0,0,s.width,s.height)
            holes=union([prism(p.buffer(s.tolerance/2,join_style=2),s.printer_z+100,tray_height) for _,_,p in footprints])
            tray=prism(outer,tray_height+s.frame_height)-holes
            if s.mount_mode=='magnets':tray=tray-union([pockets(p,s,tray_height-s.magnet_depth-s.magnet_clearance) for _,_,p in footprints])
            parts+=split_holder(tray,s)
    # A small insert/holder pair checks the same edge clearance as full tiles.
    test_shape=box(0,0,24,24)
    fit_insert=prism(test_shape.buffer(-s.tolerance/2,join_style=2),s.base)
    fit_holder=prism(test_shape.buffer(3,join_style=2),3)+prism(test_shape.buffer(3,join_style=2).difference(test_shape.buffer(s.tolerance/2,join_style=2)),2,3)
    parts.extend([record('Insert_Edge_Fit','coupon',fit_insert),record('Holder_Edge_Fit','coupon',fit_holder)])
    if s.mount_mode=='magnets':
        coupon=prism(box(0,0,25,20),s.magnet_depth+s.magnet_clearance+1.5)-prism(Point(12.5,10).buffer((s.magnet_diameter+s.magnet_clearance)/2,quad_segs=24),s.magnet_depth+s.magnet_clearance,-.01)
        parts.append(record('Magnet_Fit','coupon',coupon))
    meta=dict(metas[0]);meta['features']=dict(metas[0]['features']) if continuous else {k:sum(m['features'].get(k,0) for m in metas) for k in set().union(*(m['features'] for m in metas))}
    meta['whole_volume_mm3']=sum(p['solid'].volume() for p in parts if p['kind']=='terrain')
    meta.update(columns=s.collection_columns,rows=s.collection_rows,joints=[],frame_fit=None,format=s.map_format,map_sources=[{'name':parts[i]['map_name'],'dem':m['dem'],'osm':m['osm']} for i,m in enumerate(metas)])
    meta['warnings']=list(metas[0]['warnings']) if continuous else [f'{parts[i]["map_name"]}: {warning}' for i,m in enumerate(metas) for warning in m['warnings']]
    meta['wall_mode']=s.wall_mode
    meta['mounting']=mounting.describe(s,len(footprints)) if s.wall_mode!='legacy' else None
    if s.wall_mode!='legacy':
        meta['warnings'].append({'keyholes':'Expandable wall: one removable insert and keyed holder per tile. Rear keys align adjacent holders; hang each holder on its own screw through the rear keyhole. A keyhole tile drops 7 mm onto its screw, so add new tiles beside or above mounted ones. Keys are not load-bearing. Test print the fit pieces first.',
            'pucks':'Expandable wall: each holder pushes onto a square wall puck fixed with one countersunk screw. Use Puck_spacing_jig over a mounted puck to place the next one; no tile needs to come down to add another. Print Puck_Socket_Fit and one Wall_puck first and check the push fit.',
            'magnet_pucks':'Expandable wall: each holder is held on a square wall puck by two magnets; the square carries the weight. Glue magnets into the pucks and holders with matching polarity and let the adhesive cure before hanging. Use Puck_spacing_jig to place each new puck. Magnets, screws and adhesive are not supplied.',
            'none':'Expandable wall: one removable insert and keyed holder per tile, with no wall fixing. Rear keys align adjacent holders; fix them to a rigid backing or use your own hardware. Keys are not load-bearing.'}[s.hang_mode])
    if continuous:
        meta['warnings'].append('Continuous map: all tiles are cut from one geographic surface. Extension keeps the original geographic scale and terrain datum. Locations below that datum are flattened to the original base.')
    meta['warnings'].append(f'Collection: each tile uses its own geographic area. Holders have {s.tolerance:g} mm edge clearance. Fit-test pockets before printing; glue magnets into blind pockets with matching polarity. Magnets and adhesive are not supplied.' if s.mount_mode=='magnets' else 'Collection: removable map inserts sit in matching holders. Fit-test the edge clearance before printing the full collection.')
    return parts,meta


def split_holder(solid,s):
    from .geometry import prism
    cols,rows=s.tile_layout();result=[]
    for r in range(rows):
        for c in range(cols):
            shape=box(c*s.width/cols,r*s.height/rows,(c+1)*s.width/cols,(r+1)*s.height/rows)
            piece=solid^prism(shape,s.printer_z+100)
            if not piece.is_empty():result.append(record(f'Holder_Plate_{r+1}_{c+1}','frame',piece,r,c,{'frame':piece} if s.multicolour else None))
    return result


def modular_holders(footprints,s,tray_height):
    """Independent standard modules; open rear key pockets keep additions reversible."""
    from .geometry import prism, union, key_shape
    from . import mounting
    result=[]
    for r,c,shape in footprints:
        outer=shape.buffer(s.tile_gap/2,join_style=2)
        inner=shape.buffer(s.tolerance/2,join_style=2)
        holder=prism(outer,tray_height)+prism(outer.difference(inner),s.frame_height,tray_height)
        if s.mount_mode=='magnets':holder=holder-pockets(shape,s,tray_height-s.magnet_depth-s.magnet_clearance)
        edges=list(outer.exterior.coords)
        cx,cy=shape.centroid.coords[0]
        sockets=[]
        for a,b in zip(edges,edges[1:]):
            x,y=(a[0]+b[0])/2,(a[1]+b[1])/2
            angle=math.degrees(math.atan2(y-cy,x-cx))
            socket=affinity.translate(affinity.rotate(key_shape(s.tolerance),angle,origin=(0,0)),x,y)
            sockets.append(prism(socket,2.1,-.01))
        holder=holder-union(sockets)
        if s.hang_mode=='keyholes':
            # A rear keyhole has an entry for a 6mm head and a narrower retaining throat.
            holder=holder-mounting.keyhole_cut(cx,cy+s.tile_size*.12)
        elif mounting.puck_modes(s):
            holder=holder-mounting.socket_cut(s,cx,cy)
        result.append(record(f'Holder_{r+1}_{c+1}','frame',holder,r,c,{'frame':holder} if s.multicolour else None))
    # Print keys separately, one for each adjoining edge. All holders have the same sockets.
    outers=[shape.buffer(s.tile_gap/2,join_style=2) for _,_,shape in footprints]
    joins=[]
    for i,a in enumerate(outers):
        for j,b in enumerate(outers[i+1:],i+1):
            seam=a.boundary.intersection(b.boundary.buffer(.001))
            if seam.length>5:
                joins.append((i,j))
    for i,(a,b) in enumerate(joins):result.append(record(f'Wall_key_{i+1}','key',prism(key_shape(),1.8)))
    # Two short matching halves exercise the same socket and retaining geometry.
    test=prism(box(-12,-9,12,9),4)-prism(key_shape(s.tolerance),2.1,-.01)
    for name,region in [('Wall_Fit_Left',box(-12,-9,0,9)),('Wall_Fit_Right',box(0,-9,12,9))]:
        result.append(record(name,'coupon',test^prism(region,5)))
    result.append(record('Wall_Fit_Key','coupon',prism(key_shape(),1.8)))
    if mounting.puck_modes(s):
        result+=mounting.wall_parts(s,len(footprints),min(s.printer_width,s.printer_height)-2*s.margin)
    return result
