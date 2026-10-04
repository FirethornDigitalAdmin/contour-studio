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


def puzzle_shapes(width,height,columns,rows,clearance,tab_ratio=.18,style="rounded",seed=1):
    """A shared circular tab crosses each seam; its neighbour gets the same socket."""
    if style == "classic":
        return classic_puzzle_shapes(width,height,columns,rows,clearance,seed)
    tw,th=width/columns,height/rows
    result={(r,c):box(c*tw,r*th,(c+1)*tw,(r+1)*th) for r in range(rows) for c in range(columns)}
    radius=min(tw,th)*tab_ratio
    for r in range(rows):
        for c in range(columns-1):
            x=(c+1)*tw;y=(r+.5)*th
            a,b=((r,c),(r,c+1)) if (r+c)%2==0 else ((r,c+1),(r,c))
            # Offset into the receiving piece leaves a broad neck at the seam.
            shift=radius*.35 if a==(r,c) else -radius*.35
            tab=Point(x+shift,y).buffer(radius,quad_segs=24)
            result[a]=result[a].union(tab);result[b]=result[b].difference(tab)
    for r in range(rows-1):
        for c in range(columns):
            x=(c+.5)*tw;y=(r+1)*th
            a,b=((r,c),(r+1,c)) if (r+c)%2==0 else ((r+1,c),(r,c))
            shift=radius*.35 if a==(r,c) else -radius*.35
            tab=Point(x,y+shift).buffer(radius,quad_segs=24)
            result[a]=result[a].union(tab);result[b]=result[b].difference(tab)
    return [(r,c,p.buffer(-clearance/2,join_style=2)) for (r,c),p in result.items()]


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


def classic_puzzle_shapes(width,height,columns,rows,clearance,seed):
    tw,th=width/columns,height/rows;size=min(tw,th)
    horizontal={};vertical={}
    for r in range(rows+1):
        for c in range(columns):
            edge=[(0,0),(tw,0)] if r in (0,rows) else puzzle_edge(tw,size,0,r,c,seed)
            horizontal[r,c]=[(c*tw+x,r*th+y) for x,y in edge]
    for r in range(rows):
        for c in range(columns+1):
            edge=[(0,0),(th,0)] if c in (0,columns) else puzzle_edge(th,size,1,r,c,seed)
            vertical[r,c]=[(c*tw+y,r*th+x) for x,y in edge]
    return [(r,c,Polygon(horizontal[r,c][:-1]+vertical[r,c+1][:-1]+list(reversed(horizontal[r+1,c]))[:-1]+list(reversed(vertical[r,c]))[:-1]).buffer(-clearance/2,join_style=2))
            for r in range(rows) for c in range(columns)]


def record(ident,kind,solid,row=0,col=0,regions=None):
    p={'id':ident,'kind':kind,'solid':solid,'row':row,'column':col,'neighbours':{}}
    if regions is not None:p['material_regions']=regions
    return p


def clipped_record(part,shape,ident,row,col,s):
    from .geometry import prism
    cutter=prism(shape,s.printer_z+100)
    solid=part['solid']^cutter
    regions={k:v^cutter for k,v in part.get('material_regions',{}).items()}
    return record(ident,part['kind'],solid,row,col,regions if s.multicolour else None)


def generate_format(s,progress,data_override=None):
    from .geometry import generate_solids, prism, union
    if s.map_format=='jigsaw':
        source=s.model_copy(update=dict(map_format='artwork',layout='manual',columns=1,rows=1,joints=False,labels=False,seam=0,frame_mode='none',front_caption=False))
        inset=s.frame_width if s.frame_mode!='none' else 0
        # Generate geography in the inner area, then translate into the surround.
        iw,ih=s.width-2*inset,s.height-2*inset
        source=source.model_copy(update=dict(width=iw,height=ih,base=3))
        baseline,meta=generate_solids(source,progress,data_override)
        terrain=next(p for p in baseline if p['kind']=='terrain')
        # Compress every surface feature together, preserving its footprint and
        # colour while keeping a full-strength, flat 3 mm underside.
        top=terrain['solid'].bounding_box()[5]
        factor=min(1.,s.puzzle_relief/max(top-source.base,1e-9))
        shift=source.base*(1-factor)
        core=prism(box(0,0,iw,ih),shift) if shift>1e-9 else None
        def shallow(solid):
            return solid.scale((1,1,factor)).translate((0,0,shift))
        solid=shallow(terrain['solid'])
        regions={k:shallow(v) for k,v in terrain.get('material_regions',{}).items()}
        if core is not None:
            solid=solid+core
            if s.multicolour:regions['ground']=regions['ground']+core if 'ground' in regions else core
        terrain={**terrain,'solid':solid,'material_regions':regions}
        terrain={**terrain,'solid':terrain['solid'].translate((inset,inset,0)),
                 'material_regions':{k:v.translate((inset,inset,0)) for k,v in terrain.get('material_regions',{}).items()}}
        parts=[]
        for r,c,shape in puzzle_shapes(iw,ih,s.puzzle_columns,s.puzzle_rows,s.puzzle_clearance,style=s.puzzle_style,seed=s.puzzle_seed):
            p=clipped_record(terrain,affinity.translate(shape,inset,inset),f'Puzzle_{r+1}_{c+1}',r,c,s)
            p['assembly_offset_mm']=[0,0,s.frame_depth if inset else 0]
            parts.append(p)
        if inset:
            outer=box(0,0,s.width,s.height);inner=box(inset-s.tolerance,inset-s.tolerance,s.width-inset+s.tolerance,s.height-inset+s.tolerance)
            tray=prism(outer,s.frame_depth)+prism(outer.difference(inner),s.frame_height,s.frame_depth)
            parts+=split_holder(tray,s)
        meta.update(columns=s.puzzle_columns,rows=s.puzzle_rows,joints=[],frame_fit=None,format='jigsaw')
        meta['whole_volume_mm3']=sum(p['solid'].volume() for p in parts if p['kind']=='terrain')
        meta['puzzle_thickness_mm']=3+s.puzzle_relief
        meta['puzzle_pattern']={'style':s.puzzle_style,'seed':s.puzzle_seed}
        meta['warnings'].append(f'Almost-flat jigsaw: 3 mm base with at most {s.puzzle_relief:g} mm relief, including buildings, marks and trails. All vertical detail is compressed together. {s.puzzle_columns*s.puzzle_rows} pieces, {s.puzzle_clearance:g} mm total seam clearance. Print Puzzle_Fit pieces before the full map.')
        # Use the actual first shared edge, so the coupon tests this design.
        fit_shapes=puzzle_shapes(iw,ih,s.puzzle_columns,s.puzzle_rows,s.puzzle_clearance,style=s.puzzle_style,seed=s.puzzle_seed)
        test=fit_shapes[:2]
        for r,c,p in test:parts.append(record(f'Puzzle_Fit_{c+1}','coupon',prism(p,3)))
        return parts,meta
    parts=[];metas=[]
    footprints=list(cells(s));tray_height=max(s.frame_depth,4 if s.wall_mode!='legacy' else 3,s.magnet_depth+s.magnet_clearance+1.5 if s.mount_mode=='magnets' else 0)
    continuous=s.wall_mode=='continuous'
    shared=None
    if continuous:
        source=s.model_copy(update=dict(map_format='artwork',width=s.width-2*s.frame_width,height=s.height-2*s.frame_width,frame_mode='none',front_caption=False,joints=False,labels=False,layout='manual',columns=1,rows=1))
        baseline,shared_meta=generate_solids(source,progress,data_override)
        shared=next(p for p in baseline if p['kind']=='terrain')
        shared={**shared,'solid':shared['solid'].translate((s.frame_width,s.frame_width,0)), 'material_regions':{k:v.translate((s.frame_width,s.frame_width,0)) for k,v in shared.get('material_regions',{}).items()}}

    for i,(r,c,shape) in enumerate(footprints):
        tile=s.map_tiles[i] if i<len(s.map_tiles) else None
        bounds=tile.bounds if tile else s.bounds;name=s.name if continuous else tile.name if tile else s.name
        minx,miny,maxx,maxy=shape.bounds;w=maxx-minx;h=maxy-miny
        source=s.model_copy(update=dict(map_format='artwork',name=name,bounds=bounds,width=w,height=h,frame_mode='none',front_caption=False,joints=False,labels=False,layout='manual',columns=1,rows=1,markers=tile.markers if tile else s.markers,trails=tile.trails if tile else s.trails,custom_buildings=tile.custom_buildings if tile else s.custom_buildings,reference_image=None))
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
    if s.wall_mode!='legacy':
        meta['warnings'].append('Expandable wall: one removable insert and keyed holder per tile. Rear keys align adjacent holders; each holder must be fixed independently using its rear keyhole or to a rigid backing. Keys are not load-bearing hanging hardware. Test print the fit pieces before printing the wall.')
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
        # A rear keyhole has an entry for a 6mm head and a narrower retaining throat.
        x,y=cx,cy+s.tile_size*.12
        entry=Point(x,y).buffer(3.5,quad_segs=24)
        cavity=entry.union(Point(x,y+7).buffer(3.5,quad_segs=24)).convex_hull
        throat=Point(x,y).buffer(1.8,quad_segs=24).union(Point(x,y+7).buffer(1.8,quad_segs=24)).convex_hull
        holder=holder-prism(entry,2.8,-.01)-prism(cavity,1.8,1)-prism(throat,1.1,-.01)
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
    return result
