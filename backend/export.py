import html
import json
import re
import textwrap
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import quoteattr

import manifold3d as md
import numpy as np
import trimesh
from shapely import affinity
from shapely.geometry import box

from .geometry import as_trimesh, clean_mesh_faces, generate_solids, key_shape, prism

MATERIAL_NAMES = {
    'ground': 'Ground', 'water': 'Water', 'forest': 'Woodland', 'fields': 'Fields',
    'roads': 'Roads', 'buildings': 'Buildings', 'frame': 'Frame', 'markers': 'Special places',
}
CORE_NS = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'
MATERIAL_NS = 'http://schemas.microsoft.com/3dmanufacturing/material/2015/02'


def _write_3mf(model_chunks, path, extra_files=None):
    """Write a geometry package without printer profiles or generated G-code."""
    content_types = ET.Element('Types', {'xmlns': 'http://schemas.openxmlformats.org/package/2006/content-types'})
    for extension, content_type in [('rels', 'application/vnd.openxmlformats-package.relationships+xml'),
                                    ('model', 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml'),
                                    ('config', 'application/xml')]:
        ET.SubElement(content_types, 'Default', {'Extension': extension, 'ContentType': content_type})
    relationships = ET.Element('Relationships', {'xmlns': 'http://schemas.openxmlformats.org/package/2006/relationships'})
    ET.SubElement(relationships, 'Relationship', {'Target': '/3D/3dmodel.model', 'Id': 'rel0',
                   'Type': 'http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel'})
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', ET.tostring(content_types, encoding='utf-8', xml_declaration=True))
        archive.writestr('_rels/.rels', ET.tostring(relationships, encoding='utf-8', xml_declaration=True))
        with archive.open('3D/3dmodel.model', 'w') as model:
            for chunk in model_chunks:
                model.write(chunk)
        for name, contents in (extra_files or {}).items():
            archive.writestr(name, contents)


def _xml_start(name, attributes):
    return ('<' + name + ''.join(f' {key}={quoteattr(str(value))}' for key, value in attributes.items()) + '>').encode('utf-8')


def _model_start(multicolour=False):
    attributes = {'xmlns': CORE_NS, 'unit': 'millimeter', 'xml:lang': 'en-US'}
    if multicolour:
        attributes['xmlns:m'] = MATERIAL_NS
    return b'<?xml version="1.0" encoding="utf-8"?>' + _xml_start('model', attributes)


def _mesh_xml_chunks(mesh, material_index=None, property_id='1'):
    """Bound XML memory even for high-detail assemblies and colour skins."""
    yield b'<mesh><vertices>'
    buffer = []
    for x, y, z in mesh.vertices:
        buffer.append(f'<vertex x="{x:.9f}" y="{y:.9f}" z="{z:.9f}"/>')
        if len(buffer) >= 2048:
            yield ''.join(buffer).encode('utf-8')
            buffer.clear()
    if buffer:
        yield ''.join(buffer).encode('utf-8')
        buffer.clear()
    yield b'</vertices><triangles>'
    properties = '' if material_index is None else f' pid="{property_id}" p1="{material_index}" p2="{material_index}" p3="{material_index}"'
    for a, b, c in mesh.faces:
        buffer.append(f'<triangle v1="{a}" v2="{b}" v3="{c}"{properties}/>')
        if len(buffer) >= 2048:
            yield ''.join(buffer).encode('utf-8')
            buffer.clear()
    if buffer:
        yield ''.join(buffer).encode('utf-8')
    yield b'</triangles></mesh>'


def export_multicolour_3mf(name, meshes, palette, path):
    """One printable component object, whose coloured volumes share an origin.

    Core base materials retain portable colour properties. Bambu's optional
    part metadata follows its public bbs_3mf.cpp importer/exporter; these are
    slicer filament numbers, never physical AMS tray or printer assignments.
    """
    ET.register_namespace('m', MATERIAL_NS)
    materials = ET.Element('basematerials', {'id': '1'})
    # Bambu's standard-3MF colour importer reads this optional standard
    # extension. Keep Core base materials as the object-level fallback.
    colours = ET.Element(f'{{{MATERIAL_NS}}}colorgroup', {'id': '2'})
    colour_groups = {}
    for material in palette:
        colour_groups.setdefault(material['filament'], []).append(material)
    for filament in sorted(colour_groups):
        group = colour_groups[filament]
        ET.SubElement(materials, 'base', {'name': ' + '.join(m['name'] for m in group),
                                         'displaycolor': group[0]['colour'] + 'FF'})
        ET.SubElement(colours, f'{{{MATERIAL_NS}}}color', {'color': group[0]['colour'] + 'FF'})
    parent_id = len(meshes) + 3
    config = ET.Element('config')
    object_config = ET.SubElement(config, 'object', {'id': str(parent_id)})
    ET.SubElement(object_config, 'metadata', {'key': 'name', 'value': name})
    ET.SubElement(object_config, 'metadata', {'key': 'extruder', 'value': str(meshes[0][0]['filament'])})
    for object_id, (material, mesh) in enumerate(meshes, 3):
        volume_name = f"{material['name']} · Filament {material['filament']}"
        volume = ET.SubElement(object_config, 'part', {'id': str(object_id), 'subtype': 'normal_part'})
        ET.SubElement(volume, 'metadata', {'key': 'name', 'value': volume_name})
        ET.SubElement(volume, 'metadata', {'key': 'extruder', 'value': str(material['filament'])})

    def model_chunks():
        yield _model_start(multicolour=True)
        yield b'<metadata name="Application">Contour Studio</metadata><resources>'
        yield ET.tostring(materials, encoding='utf-8')
        yield ET.tostring(colours, encoding='utf-8')
        for object_id, (material, mesh) in enumerate(meshes, 3):
            yield _xml_start('object', {'id': object_id, 'type': 'model',
                                      'name': f"{material['name']} · Filament {material['filament']}",
                                      'pid': 1, 'pindex': material['filament'] - 1})
            yield from _mesh_xml_chunks(mesh, material['filament'] - 1, property_id='2')
            yield b'</object>'
        yield _xml_start('object', {'id': parent_id, 'type': 'model', 'name': name})
        yield b'<components>'
        for object_id in range(3, parent_id):
            yield f'<component objectid="{object_id}"/>'.encode('utf-8')
        yield f'</components></object></resources><build><item objectid="{parent_id}"/></build></model>'.encode('utf-8')

    _write_3mf(model_chunks(), path, {'Metadata/model_settings.config': ET.tostring(config, encoding='utf-8', xml_declaration=True)})


def material_palette(settings, parts):
    used = {name for part in parts for name, solid in part.get('material_regions', {}).items() if not solid.is_empty()}
    unknown = used - MATERIAL_NAMES.keys()
    if unknown:
        raise ValueError(f'Unknown material regions: {", ".join(sorted(unknown))}.')
    palette, colour_slots = [], {}
    for ident, name in MATERIAL_NAMES.items():
        if ident not in used:
            continue
        colour = getattr(settings, 'colour_' + ident).upper()
        if not re.fullmatch(r'#[0-9A-F]{6}', colour):
            raise ValueError(f'Invalid filament colour for {name}.')
        filament = colour_slots.setdefault(colour, len(colour_slots) + 1)
        palette.append({'id': ident, 'name': name, 'colour': colour, 'filament': filament})
    return palette


def validated_material_regions(part, meshes=None, *, stl_origin=None):
    """Reject missing/overlapping material volumes before publishing a pack."""
    regions = {name: solid for name, solid in part.get('material_regions', {}).items() if not solid.is_empty()}
    if not regions:
        raise ValueError(f'{part["id"]} has no printable material regions.')
    original_volume = part['solid'].volume()
    tolerance = max(0.001, original_volume * 1e-8)
    region_volume = 0.0
    for name, solid in regions.items():
        try:
            mesh = as_trimesh(solid, ensure_stl=stl_origin is not None, stl_origin=stl_origin)
        except ValueError as error:
            raise ValueError(f'{part["id"]} material {name}: {error}') from error
        if mesh.is_empty or not mesh.is_volume or not mesh.is_watertight or not mesh.is_winding_consistent or not np.isfinite(mesh.vertices).all():
            raise ValueError(f'{part["id"]} material {name} failed solid mesh validation.')
        if meshes is not None:
            meshes[name] = mesh
        region_volume += solid.volume()
    combined = md.Manifold.batch_boolean(list(regions.values()), md.OpType.Add)
    # Adjacent material skins share complicated triangulated boundaries.
    # Intersecting those boundaries can create numerical slivers even when
    # the partition is exact. Additive volume closure detects genuine overlap
    # without another intersection of every shared boundary.
    combined_volume = combined.volume()
    boundary_tolerance = max(tolerance, original_volume * 1e-6)
    if region_volume - combined_volume > boundary_tolerance:
        raise ValueError(f'{part["id"]} contains overlapping material regions.')
    # A second subtraction of coincident boundaries can leave a tiny numeric
    # residue. Scalar volume closure stays stricter; boundary residue is capped
    # at one part per million of the original volume.
    # The partition's independently evaluated volumes retain strict closure.
    # Re-union of dense roof boundaries can introduce the same numerical
    # residue as a subtraction, so apply the boundary tolerance to that union.
    if (abs(region_volume - original_volume) > tolerance
            or abs(combined_volume - original_volume) > boundary_tolerance
            or (part['solid'] - combined).volume() > boundary_tolerance
            or (combined - part['solid']).volume() > boundary_tolerance):
        raise ValueError(f'{part["id"]} material regions do not cover the original printable solid.')
    return regions


def _valid_stl_mesh(mesh, native_volume):
    """Every saved representation retains the original solid's volume cap."""
    return (not mesh.is_empty and mesh.is_volume and mesh.is_watertight
            and mesh.is_winding_consistent and np.isfinite(mesh.vertices).all()
            and np.isfinite(mesh.volume)
            and abs(mesh.volume-native_volume)<=max(.001,abs(native_volume)*1e-6))


def export_3mf(meshes, path):
    """Core 3MF package, in millimetres; parts retained as distinct assembly objects."""
    def model_chunks():
        yield _model_start()
        yield b'<resources>'
        for object_id, (name, mesh) in enumerate(meshes, 1):
            yield _xml_start('object', {'id': object_id, 'type': 'model', 'name': name})
            yield from _mesh_xml_chunks(mesh)
            yield b'</object>'
        yield b'</resources><build>'
        for object_id in range(1, len(meshes) + 1):
            yield f'<item objectid="{object_id}"/>'.encode('utf-8')
        yield b'</build></model>'
    _write_3mf(model_chunks(), path)


def assembly_svg(s,meta,parts):
    cols,rows=meta['columns'],meta['rows']
    w=820; scale=700/s.width; h=s.height*scale
    name=html.escape(s.name)
    has_keys=bool(meta['joints'])
    instructions=[f"{cols*rows} terrain tiles · {len([p for p in parts if p['kind']=='frame'])} frame pieces · {len(meta['joints'])} joining keys"]
    steps=[]
    if has_keys:
        steps.append('Print Fit_Left, Fit_Right and one Joining_key. Check the fit before printing tiles.')
    if s.multicolour:
        steps.append('For all plates together, open Bambu/Print-plates-1.3mf as a project (include subsequent numbered projects if present). For an individual piece, use its Multicolour 3MF. Follow Multicolour/readme.txt for filament and AMS mapping.')
        steps.append('The main monochrome STLs print flat side down. Material STLs are colour parts: import them together, preserving their offsets.')
    else:
        steps.append('Print each STL flat side down. A 0.2 mm layer height is a useful starting point.')
    steps.append('Arrange the tiles as above, then turn over together onto a soft, flat surface.')
    if s.labels:
        steps.append('Match the rear TOP arrows and neighbouring tile IDs.')
    if has_keys:
        steps.append(f'Insert keys into the shallow pockets across each seam. Key clearance is {s.tolerance:g} mm per side.')
    steps.append('Dry-fit and check front continuity. Glue seams'+(' and keys' if has_keys else '')+'; keep the assembly flat while curing.')
    if s.frame_mode=='separate':
        if meta.get('frame_fit'):
            fit=meta['frame_fit']
            steps.append(f'Match Frame_A1_* etc. to the terrain positions. Each frame has a {fit["lip_width_mm"]:g} mm inward rear lip, up to {fit["lip_height_mm"]:g} mm thick; the insert has a matching 45-degree underside chamfer and {fit["clearance_mm"]:g} mm side clearance.')
            steps.append('Seat the terrain insert on the angled lip from the front. For a frame made of several pieces, keep the final rail loose if sliding the insert into place; dry-fit before gluing the frame and its rear keys.')
        else:
            steps.append('Match Frame_A1_* etc. to the same terrain position, then glue the separate frame pieces.')
    steps.append('Bond the finished assembly to a rigid backing panel; mount hanging hardware on the panel.')
    instructions.extend(f'{i}. {step}' for i,step in enumerate(steps,1))
    if has_keys:
        instructions.append('Keys align the pieces. They are not a structural hanging system. Hardware is not included.')
    if s.labels:
        instructions.append('Rear labels are embossed inside recesses; the surrounding base remains flat.')
    instructions.extend(['Assembly.3mf preserves assembled positions. It may be larger than a single build plate.',
                         '© OpenStreetMap contributors · ODbL. Elevation: Mapzen Terrain Tiles (credits in model-info.json).'])
    if meta.get('osm',{}).get('buildings'):
        instructions.append('Buildings: © Overture Maps Foundation & contributors · ODbL (full credits in data-sources.txt).')
    wrapped=[line for instruction in instructions for line in textwrap.wrap(instruction,width=92,break_long_words=False)]
    total_height=h+175+len(wrapped)*24
    title_size=min(28,700/max(1,len(s.name)*0.6))
    lines=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{total_height}" viewBox="0 0 {w} {total_height}">',
           '<style>text{font-family:Arial,sans-serif;fill:#16323a} .small{font-size:14px}</style>',
           '<rect width="100%" height="100%" fill="#fff"/>',f'<text x="60" y="50" font-size="{title_size:g}" font-weight="bold">{name}</text>',
           f'<text x="60" y="78" class="small">ASSEMBLY · FRONT VIEW · NORTH / TOP ↑ · {s.width:g} × {s.height:g} mm</text>']
    for row in range(rows):
        for col in range(cols):
            x,y=60+col*700/cols,105+row*h/rows
            ident=f'{chr(65+row)}{col+1}'
            lines.extend([f'<rect x="{x}" y="{y}" width="{700/cols}" height="{h/rows}" fill="#eef3f3" stroke="#698287" stroke-width="1"/>',
                          f'<text x="{x+350/cols}" y="{y+h/rows/2}" font-size="24" text-anchor="middle">{ident}</text>'])
    if s.frame_mode!='none':
        fw=s.frame_width*scale
        lines.append(f'<rect x="{60+fw/2}" y="{105+fw/2}" width="{700-fw}" height="{h-fw}" fill="none" stroke="#16323a" stroke-width="{fw}"/>')
    for j in meta['joints']:
        x,y=60+j['x']*scale,105+(s.height-j['y'])*scale
        lines.append(f'<rect x="{x-4}" y="{y-2}" width="8" height="4" fill="#c4813a" transform="rotate({-j["angle"]} {x} {y})"/>')
    for i,line in enumerate(wrapped): lines.append(f'<text x="60" y="{h+145+i*24}" class="small">{html.escape(line)}</text>')
    lines.append('</svg>')
    return '\n'.join(lines)


def build_project(s, folder:Path, progress, data_override=None):
    folder.mkdir(parents=True,exist_ok=True)
    (folder/'project.zip').unlink(missing_ok=True)
    slug=re.sub(r'[^a-zA-Z0-9]+','-',s.name).strip('-') or 'Artwork'
    parts,meta=generate_solids(s,progress,data_override)
    if s.joints and meta['joints']:
        pocket=prism(affinity.translate(key_shape(s.tolerance),12,10),1.9,-0.1)
        coupon=prism(box(0,0,24,20),s.base)-pocket
        for name,area in [('Fit_Left',box(0,0,12,20)),('Fit_Right',box(12,0,24,20))]:
            parts.append({'id':name,'kind':'coupon','solid':coupon^prism(area,s.base+1),'neighbours':{}})
    scene=trimesh.Scene(); results=[]; assembly=[]
    palette = material_palette(s, parts) if s.multicolour else []
    material_by_id = {m['id']: m for m in palette}
    multicolour_tiles, multicolour_files = [], []
    for idx,part in enumerate(parts):
        progress(62+int(30*idx/len(parts)),f'Validating and exporting {part["id"]}')
        native_volume=part['solid'].volume()
        try:
            mesh=as_trimesh(part['solid'], ensure_stl=True)
        except ValueError as error:
            raise ValueError(f'{part["id"]}: {error}') from error
        if mesh.is_empty or not mesh.is_watertight or not mesh.is_volume or not mesh.is_winding_consistent:
            raise ValueError(f'{part["id"]} failed solid mesh validation; no print package was published.')
        if len(mesh.split(only_watertight=False))!=1:
            raise ValueError(f'{part["id"]} contains disconnected geometry. Increase base thickness or adjust frame settings.')
        ext=mesh.extents
        usable=np.array([s.printer_width-2*s.margin,s.printer_height-2*s.margin,s.printer_z])
        if np.any(ext > usable+0.01):
            raise ValueError(f'{part["id"]} dimensions {ext.round(2).tolist()} mm exceed usable printer dimensions {usable.tolist()}. Reduce relief or increase the tile count.')
        if abs(mesh.bounds[0,2])>0.001:
            raise ValueError(f'{part["id"]} does not have a flat base on z=0.')
        origin=mesh.bounds[0].copy()
        local=mesh.copy(); local.apply_translation(-origin)
        # Binary STL stores float32 coordinates. Quantize before writing, then
        # remove only collapsed/duplicate triangles created by that quantization.
        local.vertices=local.vertices.astype(np.float32).astype(np.float64)
        clean_mesh_faces(local)
        if not _valid_stl_mesh(local,native_volume):
            raise ValueError(f'{part["id"]} is not representable as a watertight binary STL at this scale.')
        category='Frame' if part['kind']=='frame' else 'Assembly' if part['kind'] in ('key','coupon') else 'STL'
        directory=folder/category; directory.mkdir(exist_ok=True)
        file=f'{category}/{slug}_{part["id"]}.stl'
        local.export(folder/file)
        # Reload the actual binary STL, not just the pre-export mesh.
        check=trimesh.load_mesh(folder/file,process=True)
        if not _valid_stl_mesh(check,native_volume):
            raise ValueError(f'{part["id"]} failed the STL round-trip validation.')
        result={k:v for k,v in part.items() if k not in ('solid', 'material_regions')}
        result.update(file=file,dimensions_mm=local.extents.round(4).tolist(),triangles=len(local.faces),watertight=True,
                      volume_mm3=round(float(mesh.volume),2),assembly_origin_mm=origin.round(6).tolist(),
                      components=1,flat_base=True,warnings=[])
        if part['kind']=='terrain': result['warnings']=['Check fine building details and short underside bridges in the slicer.']
        material_regions = None
        region_meshes = {}
        if s.multicolour and part['kind'] in ('terrain', 'frame'):
            material_regions = validated_material_regions(part, region_meshes, stl_origin=origin)
            material_meshes, material_results = [], []
            for ident in MATERIAL_NAMES:
                if ident not in material_regions:
                    continue
                material = material_by_id[ident]
                region_mesh = region_meshes[ident]
                local_region = region_mesh.copy()
                # All volumes share the parent tile's origin. Never move an
                # individual colour skin down to the bed or recenter it.
                local_region.apply_translation(-origin)
                material_meshes.append((material, local_region.copy()))
                native_region_volume=material_regions[ident].volume()
                local_region.vertices = local_region.vertices.astype(np.float32).astype(np.float64)
                clean_mesh_faces(local_region)
                if not _valid_stl_mesh(local_region,native_region_volume):
                    raise ValueError(f'{part["id"]} material {ident} cannot be represented as a solid STL.')
                region_file = f'Materials/{part["id"]}/{slug}_{part["id"]}_F{material["filament"]}_{ident}.stl'
                (folder / region_file).parent.mkdir(parents=True, exist_ok=True)
                local_region.export(folder / region_file)
                check_region = trimesh.load_mesh(folder / region_file, process=True)
                if not _valid_stl_mesh(check_region,native_region_volume):
                    raise ValueError(f'{part["id"]} material {ident} failed STL round-trip validation.')
                material_results.append({**material, 'file': region_file, 'volume_mm3': round(float(region_mesh.volume), 4)})
                multicolour_files.append(region_file)
            colour_file = f'Multicolour/{slug}_{part["id"]}.3mf'
            (folder / colour_file).parent.mkdir(parents=True, exist_ok=True)
            export_multicolour_3mf(part['id'], material_meshes, palette, folder / colour_file)
            result['multicolour_file'] = colour_file
            multicolour_tiles.append({'part_id': part['id'], 'file': colour_file, 'materials': material_results})
            multicolour_files.append(colour_file)
        results.append(result)
        if part['kind'] not in ('key','coupon'):
            assembly.append((part['id'],mesh))
            def add_preview(m,name,color):
                if m.is_empty: return
                m.visual=trimesh.visual.ColorVisuals(mesh=m,face_colors=color)
                scene.add_geometry(m,node_name=name,geom_name=name)
            if material_regions:
                for ident, region in material_regions.items():
                    colour = material_by_id[ident]['colour']
                    rgba = [int(colour[index:index+2], 16) for index in (1, 3, 5)] + [255]
                    add_preview(region_meshes[ident].copy(), f'MaterialVisual_{part["id"]}_{ident}', rgba)
            elif part['kind']=='terrain' and s.frame_mode=='integrated':
                inset=s.frame_width
                mask=prism(box(inset,inset,s.width-inset,s.height-inset),s.printer_z+100)
                add_preview(as_trimesh(part['solid']^mask),part['id'],[216,219,207,255])
                add_preview(as_trimesh(part['solid']-mask),'FrameVisual_'+part['id'],[43,64,69,255])
            else:
                add_preview(mesh,part['id'],[43,64,69,255] if part['kind']=='frame' else [216,219,207,255])
    progress(94,'Writing assembly guide and 3MF assembly')
    (folder/'preview.glb').write_bytes(scene.export(file_type='glb'))
    export_3mf(assembly,folder/'Assembly.3mf')
    (folder/'assembly-guide.svg').write_text(assembly_svg(s,meta,results), encoding='utf-8')
    info={'schema_version':1,'name':s.name,'units':'mm','created_at':datetime.now(timezone.utc).isoformat(),
          'settings':s.model_dump(),'layout':{'columns':meta['columns'],'rows':meta['rows']},'parts':results,
          'sources':{'elevation':meta.pop('dem'),'vectors':meta.pop('osm')},'model':meta,
          'notes':['STLs use local print-bed coordinates; assembly_origin_mm restores original placement.',
                   'All front geometry is generated globally before Boolean sectioning.',
                   'Use a rigid backing panel and appropriate hardware for wall mounting.']}
    if s.multicolour:
        filament_count = len({m['filament'] for m in palette})
        instructions = [
            'Open Bambu/Print-plates-*.3mf as projects for prepared plates containing every piece and the required copies of keys. Alternatively, open one Multicolour/*.3mf tile or frame piece at a time.',
            f'Create {filament_count} filament entries in Bambu Studio matching the numbered colours in materials.json. Identical colours share one filament number.',
            'Some Bambu Studio versions show "invalid config, load geometry data only" for standard 3MF files. Accept geometry-only import; these files intentionally carry no printer profile.',
            f'If Standard 3MF Import Color appears, choose {filament_count} colours to keep the palette instead of automatic colour grouping. Check the resulting colours and named parts.',
            'Import the 3MF and expand its object in the Objects list. Check each named part uses the listed filament number; assign it manually if your Studio import mode does not keep part assignments.',
            'Select your own printer, nozzle, build plate and suitable filament profiles. These geometry files do not include printer profiles, temperatures or G-code.',
            'Before printing, map the slicer filament entries to your loaded AMS trays. Slicer filament numbers are not automatic hardware tray assignments.',
            'Fallback: select all STLs from one Materials/<part_id>/ folder together, import them as one object with multiple parts, and preserve their relative positions.',
            'Do not centre, arrange, scale or drop the individual material parts to the bed. Move and arrange only the complete tile object, then assign each named part to its listed filament.',
            'Slice and inspect the colour changes, thin features and purge/flush volumes before printing. The original monochrome STL files and Assembly.3mf are also included.',
        ]
        info['multicolour'] = {'enabled': True, 'palette': palette, 'tiles': multicolour_tiles, 'instructions': instructions}
        manifest_file = 'Multicolour/materials.json'
        readme_file = 'Multicolour/readme.txt'
        (folder / 'Multicolour').mkdir(exist_ok=True)
        (folder / manifest_file).write_text(json.dumps(info['multicolour'], indent=2), encoding='utf-8')
        material_lines = []
        for filament in sorted({m['filament'] for m in palette}):
            group = [m for m in palette if m['filament'] == filament]
            material_lines.append(f'Filament {filament}: {" + ".join(m["name"] for m in group)} · {group[0]["colour"]}')
        (folder / readme_file).write_text('CONTOUR STUDIO · MULTICOLOUR PRINTING\n\n' + '\n'.join(material_lines) + '\n\n' + '\n\n'.join(f'{i}. {line}' for i, line in enumerate(instructions, 1)) + '\n', encoding='utf-8')
        multicolour_files.extend([manifest_file, readme_file])
    from .bambu import prepare_project
    info['bambu'] = prepare_project(folder, info)
    (folder/'model-info.json').write_text(json.dumps(info,indent=2), encoding='utf-8')
    (folder/'settings.json').write_text(s.model_dump_json(indent=2), encoding='utf-8')
    credits = ['Map features: © OpenStreetMap contributors, ODbL 1.0.',
               'https://www.openstreetmap.org/copyright']
    dem_source=info['sources']['elevation']
    if 'NOAA' in dem_source.get('provider',''):
        credits.extend(['Elevation: NOAA NCEI ETOPO 2022 global relief',dem_source['attribution'],dem_source['url']])
    else:
        credits.extend(['Elevation: Mapzen / AWS Terrain Tiles.',
                        'https://github.com/tilezen/joerd/blob/master/docs/attribution.md'])
    coverage=info['sources']['vectors'].get('buildings')
    if coverage:
        credits.extend(['Buildings: © OpenStreetMap contributors, Overture Maps Foundation.',
                        f'Overture release: {coverage["release"]}. License: ODbL 1.0.',
                        'Source datasets: '+', '.join(coverage['datasets']),
                        'Global ML Building Footprints: Microsoft, ODbL 1.0.',
                        'https://github.com/microsoft/GlobalMLBuildingFootprints',
                        'Additional source credits and licenses: '+coverage['url'],
                        'Building outlines and heights may be imagery-derived estimates.'])
    (folder/'data-sources.txt').write_text('\n'.join(credits)+'\n', encoding='utf-8')
    # Publish only after the entire archive is closed and validated. A client
    # must never see a partial project.zip after a disk or compression failure.
    temporary=folder/'.project.zip.tmp'
    try:
        files=[p['file'] for p in results]+multicolour_files+info['bambu']['files']+['Bambu/plates.json']+['preview.glb','Assembly.3mf','assembly-guide.svg',
                                           'model-info.json','settings.json','data-sources.txt']
        with zipfile.ZipFile(temporary,'w',zipfile.ZIP_DEFLATED) as archive:
            for file in sorted(files):
                archive.write(folder/file,f'{slug}/{file}')
        with zipfile.ZipFile(temporary) as archive:
            if archive.testzip() is not None:
                raise ValueError('Print package failed ZIP integrity validation.')
        temporary.replace(folder/'project.zip')
    finally:
        temporary.unlink(missing_ok=True)
    progress(100,'Ready to print')
    return info
