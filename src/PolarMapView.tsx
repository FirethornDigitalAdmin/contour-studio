import { shapePath } from "./artworkShapes";
import { useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Minus, Plus, X } from 'lucide-react';
import type { Bounds, Settings } from './types';
import { centreLongitude, longitudeOffset, longitudeSpan, validBounds, wrapLongitude } from './world';
import { symbols } from './MarkerEditor';
import './world.css';

export default function PolarMapView({settings,editable=true,onBounds,placingMarker,onPlaceMarker,onCancelMarker}: {
  settings: Settings; editable?: boolean; onBounds: (b:Bounds)=>void;
  placingMarker: string|null; onPlaceMarker:(lon:number,lat:number)=>void; onCancelMarker:()=>void;
}) {
  const [drag,setDrag]=useState<{x:number;y:number;b:Bounds}|null>(null);
  const interactive = editable || !!placingMarker;
  const b=settings.bounds, span=longitudeSpan(b), height=b.north-b.south;
  const move=(dx:number,dy:number,original=b)=> {
    const shift=Math.max(-90-original.south,Math.min(90-original.north,dy));
    const next={west:wrapLongitude(original.west+dx),east:wrapLongitude(original.east+dx),south:original.south+shift,north:original.north+shift};
    if(validBounds(next)) onBounds(next);
  };
  const resize=(factor:number)=> {
    const dw=Math.min(2,span*factor),dh=Math.min(2,height*factor);
    const south=Math.max(-90,Math.min(90-dh,(b.north+b.south-dh)/2));
    const centre=centreLongitude(b);
    onBounds({west:wrapLongitude(centre-dw/2),east:wrapLongitude(centre+dw/2),south,north:south+dh});
  };
  const columns=settings.layout==='auto'?Math.ceil(settings.width/(settings.printer_width-2*settings.margin)):settings.columns;
  const rows=settings.layout==='auto'?Math.ceil(settings.height/(settings.printer_height-2*settings.margin)):settings.rows;
  return <div className="map-view polar-map">
    <div className="polar-heading"><strong>Polar coordinate view</strong><span>North <ArrowUp size={13} aria-hidden="true" /> · {b.north>=85?'Arctic':'Antarctic'}</span></div>
    <div className="polar-selection" role={interactive ? "button" : "img"} tabIndex={interactive?0:undefined}
      aria-label={placingMarker?'Place special place in polar selection':'Move polar selected area'}
      style={{aspectRatio:`${settings.width} / ${settings.height}`}}
      onKeyDown={e=> {
        if (e.key === 'Escape' && placingMarker) { e.preventDefault(); onCancelMarker(); return; }
        if (placingMarker && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault(); onPlaceMarker(centreLongitude(b),(b.north+b.south)/2); return;
        }
        if(!editable) return;
        const arrows: Record<string,[number,number]>={ArrowLeft:[-span/10,0],ArrowRight:[span/10,0],ArrowUp:[0,height/10],ArrowDown:[0,-height/10]};
        if(arrows[e.key]) { e.preventDefault(); move(...arrows[e.key]); }
        if(e.key==='Escape') onCancelMarker();
      }}
      onPointerDown={e=> {
        if(placingMarker) {
          const r=e.currentTarget.getBoundingClientRect();
          onPlaceMarker(wrapLongitude(b.west+(e.clientX-r.left)/r.width*span),b.north-(e.clientY-r.top)/r.height*height);
        } else if(editable) { e.currentTarget.setPointerCapture(e.pointerId); setDrag({x:e.clientX,y:e.clientY,b}); }
      }}
      onPointerMove={e=> {
        if(!drag||!editable) return;
        const r=e.currentTarget.getBoundingClientRect();
        move((e.clientX-drag.x)/r.width*longitudeSpan(drag.b),-(e.clientY-drag.y)/r.height*(drag.b.north-drag.b.south),drag.b);
      }} onPointerUp={()=>setDrag(null)} onPointerCancel={()=>setDrag(null)}>
      <svg viewBox="0 0 600 400" preserveAspectRatio="none" aria-hidden="true">
        <path d={shapePath(settings)} transform="scale(6 4)" fill="none" stroke="currentColor" vectorEffect="non-scaling-stroke" strokeWidth="2" fillRule="evenodd"/>
        {Array.from({length:Math.min(20,columns-1)},(_,i)=><path key={`c${i}`} d={`M ${(i+1)*600/columns} 0 V 400`} stroke="currentColor" opacity=".3"/>)}
        {Array.from({length:Math.min(20,rows-1)},(_,i)=><path key={`r${i}`} d={`M 0 ${(i+1)*400/rows} H 600`} stroke="currentColor" opacity=".3"/>)}
        {(settings.trails??[]).map(t=><polyline key={t.id} points={t.points.map(([lon,lat])=>`${longitudeOffset(lon,b)/span*600},${(b.north-lat)/height*400}`).join(' ')} stroke="#b3472e" strokeWidth="3" fill="none"/>)}
      </svg>
      <span className="polar-north">{b.north.toFixed(5)}°</span><span className="polar-south">{b.south.toFixed(5)}°</span>
      <span className="polar-west">{b.west.toFixed(5)}°</span><span className="polar-east">{b.east.toFixed(5)}°</span>
      <div className="polar-centre"><strong>{settings.name}</strong><small>{(span*111.32*Math.cos((b.north+b.south)*Math.PI/360)).toFixed(2)} × {(height*111.32).toFixed(2)} km</small></div>
      {settings.markers.map(m=><span className="polar-symbol" key={m.id} title={m.label} style={{left:`${longitudeOffset(m.lon,b)/span*100}%`,top:`${(b.north-m.lat)/height*100}%`}}>{symbols[m.symbol]}</span>)}
    </div>
    {interactive&&<div className="polar-actions" aria-label="Adjust polar selection">
      {editable && <>
      <button aria-label="Move polar area west" onClick={()=>move(-span/5,0)}><ArrowLeft size={17}/></button>
      <button aria-label="Move polar area north" onClick={()=>move(0,height/5)}><ArrowUp size={17}/></button>
      <button aria-label="Move polar area south" onClick={()=>move(0,-height/5)}><ArrowDown size={17}/></button>
      <button aria-label="Move polar area east" onClick={()=>move(span/5,0)}><ArrowRight size={17}/></button>
      <button aria-label="Smaller polar area" onClick={()=>resize(.5)}><Minus size={17}/></button>
      <button aria-label="Larger polar area" onClick={()=>resize(2)}><Plus size={17}/></button>
      </>}
      {placingMarker&&<button onClick={onCancelMarker}><X size={17}/>Cancel marker</button>}
    </div>}
    <p className="polar-note">{placingMarker?'Click inside the selection, or press Enter to place your symbol at the centre. ':editable?'Drag or use the arrow keys to move the area. ':''}Street maps stop before the poles. This coordinate view uses real NOAA terrain when you generate; polar terrain has coarser detail. Exact bounds are under Name & exact coordinates.</p>
  </div>;
}
