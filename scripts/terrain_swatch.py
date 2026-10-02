"""Build the illustrative terrace card using the same contour method as exports."""
from pathlib import Path

import contourpy
import numpy as np
from shapely.geometry import LineString


def build_swatch():
    axis = np.linspace(0, 1, 241)
    u, v = np.meshgrid(axis, axis)
    heights = (0.92*np.exp(-((u-.38)**2/.045+(v-.43)**2/.11))
               + .54*np.exp(-((u-.76)**2/.032+(v-.64)**2/.07)))
    contours = contourpy.contour_generator(x=axis, y=axis, z=heights, fill_type='OuterOffset')

    def outline(points, height):
        xy = [(90+(x-y)*76, 38+(x+y)*27-height*43) for x, y in points]
        return 'M'+'L'.join(f'{x:.2f},{y:.2f}' for x, y in xy)+'Z'

    svg = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 108">',
           '<path d="M14 71 90 43 166 71 90 103Z" fill="#d5d8c9" opacity=".45"/>',
           '<path d="M14 65 90 92 166 65 166 72 90 99 14 72Z" fill="#7f8b70"/>',
           '<path d="M90 38 166 65 90 92 14 65Z" fill="#acb99a"/>']
    for band in range(1, 6):
        height = band/5
        points, offsets = contours.filled(height, np.inf)
        rings = [np.asarray(LineString(vertices[start:end]).simplify(.0005).coords)
                 for vertices, groups in zip(points, offsets)
                 for start, end in zip(groups[:-1], groups[1:])]
        if not rings:
            continue
        top = ''.join(outline(ring, height) for ring in rings)
        bottom = ''.join(outline(ring, height-.2) for ring in rings)
        svg.append(f'<path d="{bottom}{top}" fill="#81916e" fill-rule="evenodd"/>')
        svg.append(f'<path d="{top}" fill="hsl(85 20% {67+band*2}%)" fill-rule="evenodd"/>')
    svg.append('</svg>')
    return '\n'.join(svg)


if __name__ == '__main__':
    (Path(__file__).resolve().parents[1]/'public'/'terrain-terraced.svg').write_text(build_swatch())
