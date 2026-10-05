import { useId } from 'react';
import outlines from '../backend/artwork-shapes.json';
import ratios from '../backend/artwork-ratios.json';
import { NumberField } from './Controls';
import type { Settings } from './types';
export const artworkShapes = ['rectangle', 'square', 'circle', 'oval', 'triangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'star', 'heart', 'letter'] as const;
export type ArtworkShape = typeof artworkShapes[number];
export function shapeName(s: Settings) { return s.map_format === 'artwork' ? s.artwork_shape ?? 'rectangle' : 'rectangle'; }
export function shapedArtwork(s: Settings) { return s.map_format === 'artwork' && (!['rectangle', 'square'].includes(shapeName(s)) || (s.artwork_rotation ?? 0) % 360 !== 0); }
function rotated(s: Settings) {
  const key = shapeName(s) === 'letter' ? s.artwork_letter ?? 'A' : shapeName(s);
  const rings = (outlines as Record<string, number[][][]>)[key] ?? outlines.rectangle;
  const ratio = (ratios as Record<string,number>)[key] ?? 1.5;
  const angle = (s.artwork_rotation ?? 0)*Math.PI/180, c=Math.cos(angle), sn=Math.sin(angle);
  const points = rings.map(r=>r.map(([x,y])=>[(x-.5)*ratio*c-(y-.5)*sn,(x-.5)*ratio*sn+(y-.5)*c]));
  const all=points.flat(), xs=all.map(p=>p[0]), ys=all.map(p=>p[1]);
  return {points,x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)};
}
export function naturalRatio(s: Settings) { const r=rotated(s); return (r.x1-r.x0)/(r.y1-r.y0); }
export function shapeSize(s: Settings, extent: number) {
  const ratio=naturalRatio(s);
  return {width:Number((ratio>=1?extent:extent*ratio).toFixed(1)),height:Number((ratio>=1?extent/ratio:extent).toFixed(1))};
}
export function shapeRings(s: Settings): number[][][] {
  const r=rotated(s);
  return r.points.map(ring=>ring.map(([x,y])=>[(x-r.x0)/(r.x1-r.x0),(y-r.y0)/(r.y1-r.y0)]));
}
export function shapePath(s: Settings, width=100, height=100) {
  return shapeRings(s).map(ring => ring.map(([x,y],i) => `${i ? 'L' : 'M'}${x*width} ${y*height}`).join(' ') + 'Z').join(' ');
}
export function ShapeOutline({ settings:s, className }: { settings: Settings; className?: string }) {
  const clip=useId(), path=shapePath(s,s.width,s.height);
  return <svg className={className} viewBox={`0 0 ${s.width} ${s.height}`} preserveAspectRatio="none" style={className==='selection-shape'?undefined:{width:32*Math.min(1,s.width/s.height),height:32*Math.min(1,s.height/s.width)}} aria-hidden="true">
    <defs><clipPath id={clip}><path d={path} clipRule="evenodd"/></clipPath></defs>
    <path d={path} fillRule="evenodd" vectorEffect="non-scaling-stroke"/>
    {s.frame_mode!=='none'&&<path className="shape-border-preview" d={path} fill="none" stroke="#415348" strokeWidth={2*s.frame_width} strokeLinejoin="miter" strokeMiterlimit={5} clipPath={`url(#${clip})`}/>}
  </svg>;
}
export default function ShapePicker({ settings:s, onChange }: { settings:Settings; onChange:(v:Partial<Settings>)=>void }) {
  if(s.map_format !== 'artwork') return null;
  const select=(v:Partial<Settings>)=>{
    const next={...s,...v};
    onChange({...v,...shapeSize(next,Math.max(s.width,s.height)),...(shapedArtwork(next)?{joints:false,labels:false,front_caption:false,frame_contour:'flat',inner_bevel:0,outer_bevel:0,corner_radius:0,frame_width:v.artwork_shape!==undefined && v.artwork_shape!==s.artwork_shape ? Math.min(s.frame_width,4) : s.frame_width}:{})});
  };
  return <div className="control-block"><h3>Shape</h3><div className="artwork-shapes" role="group" aria-label="Artwork shape">
    {artworkShapes.map(shape => { const preview={...s,artwork_shape:shape,artwork_rotation:0}; return <button type="button" key={shape} aria-pressed={shapeName(s)===shape} onClick={()=>select({artwork_shape:shape,artwork_rotation:0})}>
      <ShapeOutline settings={{...preview,...shapeSize(preview,100)}}/><span>{shape[0].toUpperCase()+shape.slice(1)}</span>
    </button>; })}
  </div>{shapeName(s)==='letter'&&<label className="field"><span>Letter</span><select aria-label="Artwork letter" value={s.artwork_letter??'A'} onChange={e=>select({artwork_letter:e.target.value})}>{'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter=><option key={letter}>{letter}</option>)}</select></label>}
  <div className="shape-rotation"><NumberField label="Shape rotation · degrees" value={s.artwork_rotation??0} min={0} max={359} step={1} onChange={artwork_rotation=>select({artwork_rotation})}/><div className="segmented" role="group" aria-label="Rotate shape">{[0,45,90,180,270].map(angle=><button type="button" key={angle} aria-pressed={(s.artwork_rotation??0)===angle} onClick={()=>select({artwork_rotation:angle})}>{angle}°</button>)}</div></div>
  <p className="hint">Rotation turns the outline on the map and in the print. Size presets preserve the shape; custom dimensions can stretch it.</p></div>;
}
