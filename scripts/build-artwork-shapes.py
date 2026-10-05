"""Build shared, normalised artwork outlines for the picker and print engine."""
import json
import math
from pathlib import Path
from matplotlib.textpath import TextPath
from matplotlib.font_manager import FontProperties

shapes = {}
ratios = {}
def store(name, rings):
    points = [p for ring in rings for p in ring]
    x0, y0 = map(min, zip(*points)); x1, y1 = map(max, zip(*points))
    ratios[name] = round((x1-x0)/(y1-y0), 8)
    shapes[name] = [[[round((x-x0)/(x1-x0),6), round(1-(y-y0)/(y1-y0),6)] for x,y in ring] for ring in rings]
def regular(n):
    return [(math.sin(i*2*math.pi/n), math.cos(i*2*math.pi/n)) for i in range(n)]
store('rectangle', [[(0,0),(1,0),(1,1),(0,1)]])
shapes['square'] = shapes['rectangle']
ratios['rectangle'] = 1.5
ratios['square'] = 1
store('circle', [regular(128)])
store('oval', [regular(128)])
ratios['oval'] = 1.5
for name,n in [('triangle',3),('diamond',4),('pentagon',5),('hexagon',6),('octagon',8)]: store(name,[regular(n)])
store('star', [[(math.sin(i*math.pi/5)*(1 if i%2==0 else .45), math.cos(i*math.pi/5)*(1 if i%2==0 else .45)) for i in range(10)]])
store('heart', [[(16*math.sin(t)**3,13*math.cos(t)-5*math.cos(2*t)-2*math.cos(3*t)-math.cos(4*t)) for t in [i*2*math.pi/160 for i in range(160)]]])
font = FontProperties(family='DejaVu Sans', weight='bold')
for letter in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ':
    store(letter, [p.tolist() for p in TextPath((0,0),letter,size=100,prop=font).to_polygons()])
Path('backend/artwork-shapes.json').write_text(json.dumps(shapes,separators=(',',':'))+'\n')

Path('backend/artwork-ratios.json').write_text(json.dumps(ratios,separators=(',',':'))+'\n')
