"""Prepared Bambu-compatible plates, plus an explicit local application launch."""
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
from xml.etree import ElementTree as ET

import numpy as np
import trimesh

from .export import _write_3mf, _model_start, _xml_start, _mesh_xml_chunks

REVISION = 5


PRESET_META = {'type', 'name', 'inherits', 'from', 'setting_id', 'instantiation', 'description', 'include',
               'compatible_printers', 'compatible_printers_condition', 'compatible_prints', 'compatible_prints_condition'}


def studio_system_dir():
    """Bambu Studio's installed vendor presets, when it has been run on this computer."""
    override = os.environ.get('CONTOUR_BAMBU_PRESETS')
    if override:
        candidates = [Path(override)]
    elif sys.platform == 'darwin':
        candidates = [Path.home() / 'Library/Application Support/BambuStudio/system/BBL']
    elif sys.platform == 'win32':
        candidates = [Path(os.environ.get('APPDATA', Path.home() / 'AppData/Roaming')) / 'BambuStudio/system/BBL']
    else:
        candidates = [Path(os.environ.get('XDG_CONFIG_HOME', Path.home() / '.config')) / 'BambuStudio/system/BBL']
    return next((p for p in candidates if (p / 'machine').is_dir() and (p / 'process').is_dir()), None)


def resolve_preset(root, kind, name, depth=0):
    """Flatten one preset through its parents and G-code template includes."""
    path = (root / kind / f'{name}.json').resolve()
    if depth > 12 or not path.is_relative_to(root.resolve()) or not path.is_file():
        raise FileNotFoundError(name)
    data = json.loads(path.read_text(encoding='utf-8'))
    merged = {}
    if data.get('inherits'):
        merged.update(resolve_preset(root, kind, data['inherits'], depth + 1))
    for included in data.get('include') or []:
        merged.update(resolve_preset(root, kind, included, depth + 1))
    merged.update(data)
    return merged


def studio_profile(settings, filaments, root=None):
    """The user's real Bambu printer, process and PLA presets, or None.

    A project written for an unknown custom machine cannot be sent to a Bambu
    printer and slices with the wrong nozzle. Dual-nozzle machines need
    per-nozzle filament maps and keep the generic profile.
    """
    model = (settings.get('printer_model') or '').strip()
    root = root or studio_system_dir()
    if not model.startswith('Bambu Lab') or root is None:
        return None
    machine_name = f'{model} {settings.get("nozzle", 0.4):g} nozzle'
    try:
        machine = resolve_preset(root, 'machine', machine_name)
        if len(machine.get('nozzle_diameter', [])) != 1:
            return None
        process_name = machine['default_print_profile']
        process = resolve_preset(root, 'process', process_name)
        filament_name = next((path.stem for path in sorted((root / 'filament').glob('Generic PLA*.json'))
                              if (path.stem == 'Generic PLA' or path.stem.startswith('Generic PLA @')) and
                              machine_name in json.loads(path.read_text(encoding='utf-8')).get('compatible_printers', [])),
                             machine['default_filament_profile'][0])
        filament = resolve_preset(root, 'filament', filament_name)
    except (OSError, KeyError, IndexError, ValueError, TypeError):
        return None
    values = {}
    for preset in (machine, process):
        values.update({k: v for k, v in preset.items() if k not in PRESET_META})
    for key, value in filament.items():
        if key not in PRESET_META:
            values[key] = value[:1] * filaments if isinstance(value, list) and value else value
    try:
        values['curr_bed_type'] = json.loads((root / 'machine' / f'{model}.json').read_text(encoding='utf-8'))['default_bed_type']
    except (OSError, KeyError, ValueError):
        pass
    values.update(printer_settings_id=machine_name, print_settings_id=process_name,
                  filament_settings_id=[filament_name] * filaments)
    return {'values': values, 'printer': machine_name, 'process': process_name, 'filament': filament_name,
            'layer_height': float(process.get('layer_height', 0.2))}


def generic_profile(settings):
    """Unknown printers still slice with the nozzle the artwork was designed for."""
    nozzle = float(settings.get('nozzle', 0.4))
    defaults = json.loads(Path(__file__).with_name('bambu-defaults.json').read_text(encoding='utf-8'))
    layer = round(min(0.28, nozzle / 2), 2)
    values = {'nozzle_diameter': [f'{nozzle:g}'], 'printer_variant': f'{nozzle:g}', 'layer_height': f'{layer:g}',
              'initial_layer_print_height': f'{layer:g}', 'max_layer_height': [f'{round(nozzle * .7, 2):g}']}
    for key, value in defaults.items():
        if key.endswith('line_width') and isinstance(value, str):
            try:
                width = float(value)
            except ValueError:
                continue
            if width > 0:
                values[key] = f'{round(width * nozzle / .4, 2):g}'
    return values, layer


def _source(root, relative):
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError('A print file is missing. Rebuild the model and try again.')
    return path


def _footprint(root, part):
    from shapely.geometry import Polygon, box
    from shapely.ops import unary_union
    w, h, _ = part['dimensions_mm']
    if root is None or part['kind'] != 'frame':
        return box(0, 0, w, h)
    mesh = trimesh.load_mesh(_source(root, part['file']), process=False)
    triangles = mesh.vertices[mesh.faces, :2]
    polygons = [Polygon(t) for t in triangles if abs((t[1, 0]-t[0, 0])*(t[2, 1]-t[0, 1]) - (t[1, 1]-t[0, 1])*(t[2, 0]-t[0, 0])) > 1e-9]
    # The projection includes every height, including rear lips and chamfers.
    return unary_union(polygons).simplify(.001, preserve_topology=True)


def arrange(info, root=None):
    """Nest true frame footprints with 4 mm clearance and quarter-turn rotations."""
    from shapely import affinity
    s = info['settings']
    margin = s['margin']
    width, depth = s['printer_width'] - 2 * margin, s['printer_height'] - 2 * margin
    plates = []
    groups = [[p for p in info['parts'] if p['kind'] == 'coupon'],
              [p for p in info['parts'] if p['kind'] != 'coupon']]
    for group in groups:
        available = []
        for part in sorted(group, key=lambda p: (p['kind'] != 'frame', -p['dimensions_mm'][0] * p['dimensions_mm'][1])):
            w, h, z = part['dimensions_mm']
            if w > width + .01 or h > depth + .01 or z > s['printer_z'] + .01:
                raise ValueError('A piece exceeds the selected build plate. Increase tile count or rebuild the model.')
            shape = _footprint(root, part)
            orientations = []
            for angle in (0, 90, 180, 270) if part['kind'] == 'frame' and root is not None else (0,):
                rotated = affinity.rotate(shape, angle, origin=(0, 0))
                minx, miny, maxx, maxy = rotated.bounds
                orientations.append((angle, -minx, -miny, maxx-minx, maxy-miny,
                                     affinity.translate(rotated, -minx, -miny)))
            for copy in range(part.get('quantity', 1)):
                placement = None
                for plate in available:
                    for angle, ox, oy, rw, rh, rotated in orientations:
                        if rw > width + .01 or rh > depth + .01:
                            continue
                        xs = {0.0, max(0, width-rw)}
                        ys = {0.0, max(0, depth-rh)}
                        for occupied in plate['footprints']:
                            x0, y0, x1, y1 = occupied.bounds
                            xs.update((x1+4, x0-rw-4))
                            ys.update((y1+4, y0-rh-4))
                        if part['kind'] == 'frame' and root is not None:
                            # Search the thin strips that bounding-box packing misses.
                            xs.update(np.arange(0, max(0, width-rw)+.01, 2))
                            ys.update(np.arange(0, max(0, depth-rh)+.01, 2))
                        for y in sorted(v for v in ys if -.001 <= v <= depth-rh+.01):
                            for x in sorted(v for v in xs if -.001 <= v <= width-rw+.01):
                                candidate = affinity.translate(rotated, x, y)
                                if all(candidate.distance(occupied) >= 4-.001 for occupied in plate['footprints']):
                                    placement = (plate, candidate, angle, x+ox, y+oy)
                                    break
                            if placement:
                                break
                        if placement:
                            break
                    if placement:
                        break
                if placement is None:
                    angle, ox, oy, rw, rh, rotated = orientations[0]
                    plate = {'items': [], 'footprints': []}
                    plates.append(plate); available.append(plate)
                    placement = (plate, rotated, angle, ox, oy)
                plate, candidate, angle, x, y = placement
                plate['items'].append({'part': part, 'copy': copy, 'x': x+margin, 'y': y+margin, 'angle': angle})
                plate['footprints'].append(candidate)
    return plates


def prepare_project(root, info):
    """Support older saved artworks too. Split only at Studio's 36-plate limit."""
    plates = arrange(info, root)
    if not plates:
        raise ValueError('No printable pieces were found.')
    directory = root / 'Bambu'
    directory.mkdir(exist_ok=True)
    files = []
    for start in range(0, len(plates), 36):
        file = f'Bambu/Print-plates-{start // 36 + 1}.3mf'
        profile = _export(root, info, plates[start:start + 36], directory / Path(file).name, start)
        files.append(file)
    manifest = {'revision': REVISION, 'files': files, 'plate_count': len(plates),
                'piece_count': sum(len(p['items']) for p in plates), 'profile': profile,
                'nozzle': info['settings'].get('nozzle', 0.4)}
    (directory / 'plates.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    return manifest


def _export(root, info, plates, target, offset):
    s = info['settings']
    palette = (info.get('multicolour') or {}).get('palette', [])
    tiles = {t['part_id']: t for t in (info.get('multicolour') or {}).get('tiles', [])}
    colours = {m['filament']: m['colour'] for m in palette} or {1: '#D8DBCF'}
    config = ET.Element('config')
    objects, build = [], []
    next_id = 1
    cols = math.ceil(math.sqrt(len(plates)))
    for index, plate in enumerate(plates):
        plate_config = ET.SubElement(config, 'plate')
        for key, value in [('plater_id', index + 1), ('plater_name', f'Plate {offset + index + 1}'), ('locked', 'false')]:
            ET.SubElement(plate_config, 'metadata', key=key, value=str(value))
        for item in plate['items']:
            part = item['part']
            tile = tiles.get(part['id'])
            volumes = tile['materials'] if tile else [{'file': part['file'], 'name': part['id'], 'filament': 1}]
            volume_ids = list(range(next_id, next_id + len(volumes)))
            parent_id = next_id + len(volumes)
            next_id = parent_id + 1
            name = part['id'] + (f' · {item["copy"] + 1}' if part.get('quantity', 1) > 1 else '')
            objects.append((parent_id, name, list(zip(volume_ids, volumes))))
            obj = ET.SubElement(config, 'object', id=str(parent_id))
            for key, value in [('name', name), ('extruder', volumes[0]['filament'])]:
                ET.SubElement(obj, 'metadata', key=key, value=str(value))
            for ident, volume in zip(volume_ids, volumes):
                node = ET.SubElement(obj, 'part', id=str(ident), subtype='normal_part')
                for key, value in [('name', volume['name']), ('extruder', volume['filament'])]:
                    ET.SubElement(node, 'metadata', key=key, value=str(value))
            instance = ET.SubElement(plate_config, 'model_instance')
            for key, value in [('object_id', parent_id), ('instance_id', 0), ('identify_id', parent_id)]:
                ET.SubElement(instance, 'metadata', key=key, value=str(value))
            x = item['x'] + (index % cols) * s['printer_width'] * 1.2
            y = item['y'] - (index // cols) * s['printer_height'] * 1.2
            build.append((parent_id, x, y, item['angle']))

    def chunks():
        yield _model_start()
        # This marker selects Bambu's native plate importer. Designer records the actual producer.
        yield b'<metadata name="Application">BambuStudio-01.09.00.00</metadata><metadata name="BambuStudio:3mfVersion">1</metadata><metadata name="Designer">Contour Studio</metadata><resources>'
        for parent_id, name, volumes in objects:
            for ident, volume in volumes:
                mesh = trimesh.load_mesh(_source(root, volume['file']), process=False)
                if not np.isfinite(mesh.vertices).all():
                    raise ValueError('Invalid print geometry. Rebuild the artwork.')
                yield _xml_start('object', {'id': ident, 'type': 'model'})
                yield from _mesh_xml_chunks(mesh)
                yield b'</object>'
            yield _xml_start('object', {'id': parent_id, 'type': 'model', 'name': name})
            yield b'<components>'
            for ident, _ in volumes:
                yield f'<component objectid="{ident}"/>'.encode()
            yield b'</components></object>'
        yield b'</resources><build>'
        for ident, x, y, angle in build:
            c = round(math.cos(math.radians(angle)))
            sn = round(math.sin(math.radians(angle)))
            yield f'<item objectid="{ident}" transform="{c} {sn} 0 {-sn} {c} 0 0 0 1 {x:.6f} {y:.6f} 0"/>'.encode()
        yield b'</build></model>'

    defaults = json.loads(Path(__file__).with_name('bambu-defaults.json').read_text(encoding='utf-8'))
    profile = studio_profile(s, len(colours))
    if profile:
        defaults.update(profile['values'])
        layer = profile['layer_height']
    else:
        generic, layer = generic_profile(s)
        defaults.update({'printer_technology': 'FFF', 'printer_settings_id': 'Contour Studio custom bed',
                         'printer_model': 'Custom',
                         'printable_area': ['0x0', f'{s["printer_width"]}x0', f'{s["printer_width"]}x{s["printer_height"]}', f'0x{s["printer_height"]}'],
                         'printable_height': str(s['printer_z']), 'bed_exclude_area': [],
                         'print_settings_id': f'Contour Studio {layer:.2f}mm starting point',
                         'filament_settings_id': ['Generic PLA'] * len(colours), 'filament_type': ['PLA'] * len(colours), **generic})
    defaults.update({'filament_colour': [colours[i] for i in sorted(colours)], 'enable_prime_tower': '1' if len(colours) > 1 else '0'})
    for key in ('inherits_group', 'different_settings_to_system'):
        defaults[key] = [''] * (len(colours) + 2)
    defaults['flush_volumes_vector'] = ['140'] * (len(colours) * 2)
    defaults['flush_volumes_matrix'] = ['0' if i == j else '280' for i in range(len(colours)) for j in range(len(colours))]
    settings = defaults
    temporary = target.with_suffix('.tmp')
    try:
        _write_3mf(chunks(), temporary, {'Metadata/model_settings.config': ET.tostring(config, encoding='utf-8', xml_declaration=True),
                                       'Metadata/project_settings.config': json.dumps(settings)})
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    return {'printer': profile['printer'], 'process': profile['process'], 'filament': profile['filament'], 'layer_height': layer} if profile else \
        {'printer': None, 'process': None, 'filament': None, 'layer_height': layer}


def launch_projects(paths):
    """No shell or arbitrary executable supplied by the browser."""
    if sys.platform == 'darwin':
        candidates = [Path('/Applications/BambuStudio.app'), Path.home() / 'Applications/BambuStudio.app']
        app = next((p for p in candidates if p.is_dir()), None)
        if app is None:
            raise FileNotFoundError('Bambu Studio was not found. Install it, or download the plate project and open it manually.')
        for path in paths:
            subprocess.run(['/usr/bin/open', '-n', '-a', str(app), '--args', str(path)], check=True, timeout=15)
    else:
        executable = shutil.which('bambu-studio') or shutil.which('BambuStudio')
        if sys.platform == 'win32':
            candidates = [Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Bambu Studio/bambu-studio.exe',
                          Path(os.environ.get('LOCALAPPDATA', '')) / 'Programs/Bambu Studio/bambu-studio.exe']
            executable = executable or next((str(p) for p in candidates if p.is_file()), None)
        if not executable:
            raise FileNotFoundError('Bambu Studio was not found. Install it, or download the plate project and open it manually.')
        for path in paths:
            subprocess.Popen([executable, str(path)])
