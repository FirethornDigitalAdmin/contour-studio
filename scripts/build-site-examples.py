"""Generate the real models pictured on the website. Run from the project root:

    .venv/bin/python scripts/build-site-examples.py

Each example is an ordinary print pack built by the engine from the saved
Keswick design, so the pictures always show what the app actually makes.
"""
import json
import sys
from pathlib import Path

import numpy as np
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend import mounting
from backend.config import Settings, MapTile
from backend.export import build_project
from backend.formats import cells, collection_size
from backend.geometry import as_trimesh, generate_solids

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'site-examples'
SOURCE = ROOT / 'data' / 'projects' / '6a594aaa-b867-447a-9167-e68770f2174a' / 'settings.json'


def progress(percent, message):
    print(f'  {percent:3d}% {message}', flush=True)


def base():
    saved = json.loads(SOURCE.read_text())
    saved = saved.get('settings', saved)
    return Settings.model_validate({k: v for k, v in saved.items() if k in Settings.model_fields})


def jigsaw(s):
    return s.model_copy(update=dict(project_type='jigsaw', map_format='jigsaw', frame_mode='separate', frame_depth=3, frame_height=1.5,
                                    frame_contour='flat', frame_width=10, base=3, joints=False, labels=True, front_caption=False, layout='auto',
                                    width=220, height=220, puzzle_style='classic', puzzle_seed=7, puzzle_columns=4, puzzle_rows=4,
                                    puzzle_relief=1.2, hang_mode='none', multicolour=True, resolution=384))


def lettered(s):
    return s.model_copy(update=dict(frame_mode='separate', frame_contour='flat', frame_width=14, frame_depth=5, frame_height=10, corner_radius=2,
                                    inner_bevel=1, outer_bevel=.8, front_caption=True, caption_text='KESWICK · OUR FIRST SUMMER IN THE LAKES', caption_font='serif',
                                    caption_size=6, hang_mode='keyholes', base=max(s.base, 4), multicolour=True, plaque=True, plaque_title='Keswick',
                                    plaque_subtitle='Our first summer in the Lakes', plaque_shape='ticket', plaque_font='serif', plaque_width=110,
                                    colour_markers='#E9DECA'))


def wall(s):
    w = s.model_copy(update=dict(project_type='modular', map_format='mini_tiles', wall_mode='continuous', project_name='Keswick wall',
                                 wall_positions=[(1, 0), (1, 1), (0, 0)], collection_columns=2, collection_rows=2, tile_size=100, tile_gap=6,
                                 frame_mode='separate', frame_contour='flat', frame_height=3, frame_depth=4, frame_width=10, mount_mode='magnets',
                                 hang_mode='magnet_pucks', joints=False, labels=False, front_caption=False, layout='auto', resolution=256,
                                 multicolour=False, elevation_reference=None, wall_scale=None, base=max(s.base, 3.4)))
    w.width, w.height = collection_size(w)
    w.map_tiles = [MapTile(id=str(i), name=s.name, bounds=s.bounds) for i in range(3)]
    return Settings.model_validate(w.model_dump())


def mounting_scene(s, folder):
    """The same wall seen from behind, with its printed wall hardware lifted clear."""
    parts, _ = generate_solids(s, lambda *a: None)
    scene = trimesh.Scene()
    def add(solid, name, lift=0, shift=(0, 0)):
        mesh = as_trimesh(solid)
        # Turn the wall over so its rear faces the camera, as it would while fitting it.
        mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi, (0, 1, 0)))
        mesh.apply_translation((s.width+shift[0], shift[1], lift))
        scene.add_geometry(mesh, node_name=name, geom_name=name)
    for part in parts:
        if part['kind'] == 'frame':
            add(part['solid'], part['id'])
        elif part['kind'] == 'terrain':
            add(part['solid'].translate(tuple(part.get('assembly_offset_mm', (0, 0, 0)))), 'Insert_'+part['id'])
    puck = next(p for p in parts if p['id'] == 'Wall_puck')['solid']
    centres = [shape.centroid.coords[0] for _, _, shape in cells(s)]
    for index, (cx, cy) in enumerate(centres):
        add(puck.translate((cx, cy, 0)), f'Puck_{index+1}', lift=16 if index else 34)
    a, b = centres[0], centres[1]
    jig = mounting.spacing_jig(s, 1000).rotate((0, 0, float(np.degrees(np.arctan2(b[1]-a[1], b[0]-a[0]))))).translate((a[0], a[1], 0))
    add(jig, 'Jig', lift=58)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'preview.glb').write_bytes(scene.export(file_type='glb'))


def main():
    s = base()
    wanted = sys.argv[1:] or ['jigsaw', 'lettering', 'mounting']
    for name, design in [('jigsaw', jigsaw(s)), ('lettering', lettered(s))]:
        if name in wanted:
            print(name, flush=True)
            info = build_project(Settings.model_validate(design.model_dump()), OUT / name, progress)
            print(f'  {len(info["parts"])} parts', flush=True)
    if 'mounting' in wanted:
        print('mounting', flush=True)
        design = wall(s)
        build_project(design, OUT / 'mounting-pack', progress)
        mounting_scene(Settings.model_validate_json((OUT / 'mounting-pack' / 'settings.json').read_text()), OUT / 'mounting')


if __name__ == '__main__':
    main()
