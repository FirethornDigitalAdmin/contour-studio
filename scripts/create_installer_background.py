"""Render the Mac installer artwork using Contour Studio's existing brand assets.

Run with Pillow installed. Finder icons sit at (160, 130) and (470, 130).
"""
from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SCALE = 3
PAPER, GREEN, INK, MUTED, CLAY = '#fcfbf7', '#263e36', '#28312c', '#59665e', '#aa432e'
image = Image.new('RGB', (640*SCALE, 360*SCALE), PAPER)
draw = ImageDraw.Draw(image)

def font(size, bold=False):
    name = 'Arial Bold.ttf' if bold else 'Arial.ttf'
    return ImageFont.truetype('/System/Library/Fonts/Supplemental/'+name, size*SCALE)

def text(x, y, value, size, fill=INK, bold=False, anchor='mm'):
    draw.text((x*SCALE,y*SCALE),value,font=font(size,bold),fill=fill,anchor=anchor)

# Subtle contour lines stay below the installation targets and instructions.
for radius in range(50, 300, 18):
    points=[]
    for i in range(161):
        angle=math.pi+i*math.pi/160
        r=radius+7*math.sin(angle*4)
        points.append(((620+r*math.cos(angle))*SCALE,(398+r*.55*math.sin(angle))*SCALE))
    draw.line(points,fill='#e7eadf',width=SCALE)

logo=Image.open(ROOT/'public/icon-192.png').convert('RGBA').resize((32*SCALE,32*SCALE),Image.Resampling.LANCZOS)
image.paste(logo,(30*SCALE,23*SCALE),logo)
text(73,39,'contour',22,GREEN,True,'lm')
text(162,39,'studio',22,GREEN,False,'lm')
text(610,39,'INSTALL FOR MAC',10,MUTED,True,'rm')
draw.line([(30*SCALE,70*SCALE),(610*SCALE,70*SCALE)],fill='#dedfd6',width=SCALE)

# A proper graphic arrow, centred between the native draggable icons.
draw.polygon([(265*SCALE,118*SCALE),(325*SCALE,118*SCALE),(325*SCALE,98*SCALE),(368*SCALE,130*SCALE),(325*SCALE,162*SCALE),(325*SCALE,142*SCALE),(265*SCALE,142*SCALE)],fill=CLAY)
text(320,227,'Drag Contour Studio into Applications',19,GREEN,True)
text(320,255,'Then open the app from your Applications folder.',13,MUTED)
text(30,327,'Your places, made tangible.',13,GREEN,False,'lm')
text(610,327,'FREE & OPEN SOURCE',9,MUTED,True,'rm')
image.resize((640,360),Image.Resampling.LANCZOS).save(ROOT/'desktop/installer-background.png')
print(ROOT/'desktop/installer-background.png')
