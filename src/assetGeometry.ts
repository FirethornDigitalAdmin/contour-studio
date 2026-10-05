import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import fontData from './assets/plaque-font.json';

export type AssetKind = 'key' | 'bridge' | 'mount' | 'square' | 'hex' | 'plaque';
export type PlaqueStyle = 'rectangle' | 'rounded' | 'oval' | 'heritage' | 'shield';
export type LetterMode = 'engraved' | 'raised' | 'ams';
export type AssetOptions = { width: number; height: number; thickness: number; hole: number; text: string; plaqueStyle?: PlaqueStyle; letterMode?: LetterMode; baseColour?: string; textColour?: string };
export const assetDefaults: Record<AssetKind, AssetOptions> = {
  key: { width: 10, height: 6, thickness: 1.8, hole: 0, text: '' },
  bridge: { width: 50, height: 16, thickness: 3, hole: 3.5, text: '' },
  mount: { width: 40, height: 60, thickness: 4, hole: 4, text: '' },
  square: { width: 100, height: 100, thickness: 4, hole: 0, text: '' },
  hex: { width: 100, height: 86.6, thickness: 4, hole: 0, text: '' },
  plaque: { width: 100, height: 40, thickness: 3, hole: 0, text: 'A place worth making', plaqueStyle:'heritage',letterMode:'engraved',baseColour:'#355747',textColour:'#e9d4a4' },
};
const font = new FontLoader().parse(fontData);
const keyPoints = [[-5,-3],[-2,-3],[-1,-1.8],[1,-1.8],[2,-3],[5,-3],[5,3],[2,3],[1,1.8],[-1,1.8],[-2,3],[-5,3]];
function polygon(points: number[][]) { return new THREE.Shape(points.map(([x,y]) => new THREE.Vector2(x,y))); }
function outline(kind: AssetKind, o: AssetOptions) {
  const {width:w,height:h,hole:d} = o;
  const shape = kind === 'key' ? polygon(keyPoints.map(([x,y]) => [x*w/10,y*h/6]))
    : kind === 'hex' ? polygon(Array.from({length:6}, (_,i) => [(w/2-.1/Math.cos(Math.PI/6))*Math.cos(i*Math.PI/3), (w/2-.1/Math.cos(Math.PI/6))*Math.sin(i*Math.PI/3)]))
    : kind === 'square' ? polygon([[-w/2+.1,-w/2+.1],[w/2-.1,-w/2+.1],[w/2-.1,w/2-.1],[-w/2+.1,w/2-.1]])
    : kind === 'plaque' ? plaqueOutline(o)
    : polygon([[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]]);
  if (kind === 'bridge' || kind === 'mount') {
    const positions = kind === 'bridge' ? [[-w/2+8,0],[w/2-8,0]] : [[0,-h/2+10],[0,h/2-10]];
    for (const [x,y] of positions) { const path = new THREE.Path(); path.absarc(x,y,d/2,0,Math.PI*2,true); shape.holes.push(path); }
  }
  return shape;
}
function plaqueOutline(o:AssetOptions) {
  const w=o.width,h=o.height,s=new THREE.Shape();
  if(o.plaqueStyle==='oval') return polygon(Array.from({length:96},(_,i)=>[w/2*Math.cos(i*Math.PI/48),h/2*Math.sin(i*Math.PI/48)]));
  if(o.plaqueStyle==='shield') return polygon([[-w/2,h/2],[w/2,h/2],[w/2,-h*.2],[w*.32,-h*.35],[0,-h/2],[-w*.32,-h*.35],[-w/2,-h*.2]]);
  if(o.plaqueStyle==='heritage') return polygon([[-w/2,-h*.22],[-w*.4,-h*.22],[-w*.4,-h/2],[w*.4,-h/2],[w*.4,-h*.22],[w/2,-h*.22],[w/2,h*.22],[w*.4,h*.22],[w*.4,h/2],[-w*.4,h/2],[-w*.4,h*.22],[-w/2,h*.22]]);
  if(o.plaqueStyle==='rounded') {
    const r=Math.min(h*.22,8);s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.absarc(w/2-r,-h/2+r,r,-Math.PI/2,0,false);s.lineTo(w/2,h/2-r);s.absarc(w/2-r,h/2-r,r,0,Math.PI/2,false);s.lineTo(-w/2+r,h/2);s.absarc(-w/2+r,h/2-r,r,Math.PI/2,Math.PI,false);s.lineTo(-w/2,-h/2+r);s.absarc(-w/2+r,-h/2+r,r,Math.PI,Math.PI*1.5,false);return polygon(s.getPoints(8).map(p=>[p.x,p.y]));
  }
  return polygon([[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]]);
}
export function assetError(kind: AssetKind, o: AssetOptions): string {
  if (![o.width,o.height,o.thickness,o.hole].every(Number.isFinite)) return 'Enter a number in every dimension.';
  if (o.width < 10 || o.width > 300 || o.height < 6 || o.height > 300 || o.thickness < 1 || o.thickness > 12) return 'Use width 10–300 mm, height 6–300 mm and thickness 1–12 mm.';
  if ((kind === 'bridge' && (o.width < 30 || o.height < 10)) || (kind === 'mount' && (o.width < 16 || o.height < 35))) return 'Increase the plate dimensions to leave material around the holes.';
  if ((kind === 'bridge' || kind === 'mount') && (o.hole < 2 || o.hole > 6)) return 'Use a hole diameter between 2 and 6 mm.';
  if (kind === 'plaque' && (o.width < 30 || o.height < 15)) return 'Plaques need at least 30 × 15 mm for lettering.';
  if ((kind==='hex'||kind==='square') && ![80,100,140].includes(o.width)) return 'Choose a Small, Medium or Large tile size.';
  if(kind==='plaque' && [o.baseColour,o.textColour].some(c=>c!==undefined&&!/^#[0-9a-f]{6}$/i.test(c))) return 'Choose valid base and lettering colours.';
  if (kind === 'plaque' && o.letterMode==='ams' && !o.text.trim()) return 'Add lettering for a multicolour plaque, or choose engraved / raised for a blank.';
  if (kind === 'plaque' && (o.text.length > 48 || [...o.text].some(char => char !== ' ' && !font.data.glyphs[char]))) return 'Use up to 48 characters supported by the plaque font (letters, numbers and common punctuation).';
  return '';
}
const extrude = (shape: THREE.Shape | THREE.Shape[], depth: number) => new THREE.ExtrudeGeometry(shape, {depth,bevelEnabled:false,curveSegments:8,steps:1});

/** A single closed engraved solid, with the lettering cut into the top face. */
export function assetGeometry(kind: AssetKind, o: AssetOptions) {
  const error = assetError(kind,o); if (error) throw new Error(error);
  const shape = outline(kind,o);
  if (kind !== 'plaque' || !o.text.trim()) return extrude(shape,o.thickness);
  const letters=plaqueLetters(o);
  return plaqueSolid(o,shape,letters,o.letterMode==='raised');
}
export function plaqueLetters(o:AssetOptions) {
  const glyphs = font.generateShapes(o.text.trim(), 7);
  const textBounds = new THREE.Box2();
  glyphs.forEach(g => g.getPoints(8).forEach(p => textBounds.expandByPoint(p)));
  const size = textBounds.getSize(new THREE.Vector2());
  const safeWidth=o.plaqueStyle==='oval'?o.width*.72:o.plaqueStyle==='shield'?o.width*.78:o.width-10;
  const safeHeight=['shield','heritage'].includes(o.plaqueStyle||'')?o.height*.38:o.height-8;
  const scale = Math.min(1, safeWidth/size.x, safeHeight/size.y);
  const centre = textBounds.getCenter(new THREE.Vector2());
  const move = (p: THREE.Vector2) => new THREE.Vector2((p.x-centre.x)*scale,(p.y-centre.y)*scale);
  const contour = (path: THREE.Path) => {
    const points = path.getPoints(8).map(move);
    if (points[0].distanceTo(points[points.length-1]) < .00001) points.pop();
    return points.filter((p,i) => {
      const a=points[(i+points.length-1)%points.length], b=points[(i+1)%points.length];
      return Math.abs((p.x-a.x)*(b.y-p.y)-(p.y-a.y)*(b.x-p.x)) > .000001;
    });
  };
  return glyphs.map(g => {
    const s = new THREE.Shape(contour(g));
    s.holes = g.holes.map(h => new THREE.Path(contour(h))); return s;
  });
}
function plaqueSolid(o:AssetOptions,shape:THREE.Shape,letters:THREE.Shape[],raised:boolean) {
  const top = outline('plaque',o);
  const islands: THREE.Shape[] = [];
  letters.forEach(g => { top.holes.push(new THREE.Path(g.getPoints())); g.holes.forEach(h => islands.push(new THREE.Shape(h.getPoints()))); });
  const vertices: number[] = [];
  // Earcut can omit collinear boundary points between separate letters. Split
  // those surface edges so the top and engraving walls share the same edges.
  const boundary = [shape,...letters].flatMap(g => [g,...g.holes].flatMap(p => p.getPoints()));
  function append(geometry: THREE.BufferGeometry, keep: (z: number[]) => boolean, reverse = false, offset = 0) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = flat.getAttribute('position');
    for (let i=0;i<p.count;i+=3) {
      if (!keep([p.getZ(i),p.getZ(i+1),p.getZ(i+2)])) continue;
      for (const j of reverse ? [i+2,i+1,i] : [i,i+1,i+2]) vertices.push(p.getX(j),p.getY(j),p.getZ(j)+offset);
    }
    if (flat !== geometry) flat.dispose(); geometry.dispose();
  }
  const depth = Math.min(.8, o.thickness/3);
  append(extrude(shape,o.thickness), zs => !zs.every(z => Math.abs(z-o.thickness)<.0001));
  const triangulated = new THREE.ShapeGeometry([top,...islands],8);
  const surface = triangulated.toNonIndexed();
  triangulated.dispose();
  const p = surface.getAttribute('position');
  for (let i=0;i<p.count;i+=3) {
    const triangle = [0,1,2].map(j => new THREE.Vector2(p.getX(i+j),p.getY(i+j)));
    const centre = triangle.reduce((sum,v)=>sum.add(v),new THREE.Vector2()).multiplyScalar(1/3);
    for (let j=0;j<3;j++) {
      const a=triangle[j], b=triangle[(j+1)%3], delta=b.clone().sub(a), length=delta.lengthSq();
      const points = [{v:a,t:0},{v:b,t:1}];
      for (const v of boundary) {
        const t=v.clone().sub(a).dot(delta)/length;
        if (t > .00001 && t < .99999 && Math.abs((v.x-a.x)*delta.y-(v.y-a.y)*delta.x)/Math.sqrt(length)<.00001 && !points.some(point=>point.v.distanceTo(v)<.00001)) points.push({v,t});
      }
      points.sort((a,b)=>a.t-b.t);
      for (let k=0;k<points.length-1;k++) for (const v of [centre,points[k].v,points[k+1].v]) vertices.push(v.x,v.y,o.thickness);
    }
  }
  surface.dispose();
  if(raised) append(extrude(letters,depth), zs => !zs.every(z => Math.abs(z)<.0001), false, o.thickness);
  else append(extrude(letters,depth), zs => !zs.every(z => Math.abs(z-depth)<.0001), true, o.thickness-depth);
  const result = new THREE.BufferGeometry(); result.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); result.computeVertexNormals(); return result;
}
export function plaqueMaterials(o:AssetOptions) {
  const base=assetGeometry('plaque',{...o,letterMode:'engraved'});
  const text=extrude(plaqueLetters(o),Math.min(.8,o.thickness/3));text.translate(0,0,o.thickness-Math.min(.8,o.thickness/3));
  return [{name:'Plaque base',colour:o.baseColour||'#355747',geometry:base},{name:'Lettering',colour:o.textColour||'#e9d4a4',geometry:text}];
}
export function geometrySTL(geometry:THREE.BufferGeometry) {
  const mesh=new THREE.Mesh(geometry);mesh.updateMatrixWorld(true);
  return new Blob([new STLExporter().parse(mesh,{binary:true})],{type:'model/stl'});
}
export function assetSTL(kind: AssetKind, o: AssetOptions) {
  const geometry = assetGeometry(kind,o);
  const mesh = new THREE.Mesh(geometry); mesh.updateMatrixWorld(true);
  const data = new STLExporter().parse(mesh,{binary:true}); geometry.dispose();
  return new Blob([data],{type:'model/stl'});
}
export function assetSource(kind: AssetKind, o: AssetOptions) {
  const holes = kind === 'bridge' ? 'for(x=[-w/2+8,w/2-8]) translate([x,0,-1]) cylinder(h=t+2,d=hole);'
    : kind === 'mount' ? 'for(y=[-h/2+10,h/2-10]) translate([0,y,-1]) cylinder(h=t+2,d=hole);' : '';
  const base = kind === 'key' ? `linear_extrude(t) polygon(${JSON.stringify(keyPoints.map(([x,y]) => [x*o.width/10,y*o.height/6]))});`
    : kind === 'hex' ? 'linear_extrude(t) offset(delta=-.1) polygon([for(i=[0:5]) [w/2*cos(i*60),w/2*sin(i*60)]]);'
    : kind === 'square' ? 'translate([-w/2+.1,-w/2+.1,0]) cube([w-.2,w-.2,t]);'
    : kind === 'plaque' ? `linear_extrude(t) polygon([for(p=${JSON.stringify(plaqueOutline(o).getPoints().map(p=>[p.x/o.width,p.y/o.height]))}) [p[0]*w,p[1]*h]]);`
    : 'translate([-w/2,-h/2,0]) cube([w,h,t]);';
  if(kind==='plaque') {
    const depth=Math.min(.8,o.thickness/3), raised=o.letterMode==='raised';
    const safeWidth=o.plaqueStyle==='oval'?o.width*.72:o.plaqueStyle==='shield'?o.width*.78:o.width-10;
    const safeHeight=['shield','heritage'].includes(o.plaqueStyle||'')?o.height*.38:o.height-8;
    const text=o.text.trim()?`translate([0,0,${raised?'t':`t-${depth}`}]) linear_extrude(${depth}) resize([${safeWidth},${Math.min(7,safeHeight)}],auto=true) text(${JSON.stringify(o.text.trim())},halign="center",valign="center",font="Liberation Sans");`:'';
    return `// Contour Studio plaque. mm. Free to print, modify and share.\n// Local font differs from the downloadable STL. Change export_part for colour parts.\n$fn=64; w=${o.width}; h=${o.height}; t=${o.thickness};\nexport_part="assembly"; // assembly, base, lettering\nmodule lettering(){${text}}\nmodule base(){${raised?base:`difference(){${base} lettering();}`}}\nif(export_part=="base") base();\nelse if(export_part=="lettering") lettering();\nelse {color("${o.baseColour||'#355747'}") base();${raised||o.letterMode==='ams'?`color("${o.textColour||'#e9d4a4'}") lettering();`:''}}\n`;
  }
  const lettering = '';

  return `// Contour Studio accessory. Dimensions in mm. Free to print, modify and share.\n// Editable OpenSCAD source; plaque lettering uses your local font and may differ from the STL.\n$fn=64;\nw=${o.width}; h=${o.height}; t=${o.thickness}; hole=${o.hole};\ndifference(){\n  ${base}\n  ${holes}\n  ${lettering}\n}\n`;
}
