import { useRef, useState } from 'react';
import { Route, Upload, Trash2, Pencil } from 'lucide-react';
import type { Settings, Trail } from './types';
import { api, hostedWorkspace } from './hosted';
import { NumberField } from './Controls';
import { validTrails } from './validation';
export function parseRoute(text:string,filename:string):[number,number][][] {
  if(filename.toLowerCase().endsWith('.gpx')) {
    const xml=new DOMParser().parseFromString(text,'application/xml');
    if(xml.querySelector('parsererror'))throw new Error('This GPX file could not be read.');
    const segments=Array.from(xml.getElementsByTagName('trkseg'));
    const routes=Array.from(xml.getElementsByTagName('rte'));
    const groups=segments.length?segments:routes.length?routes:[xml.documentElement];
    return groups.map(g=>Array.from(g.querySelectorAll('trkpt,rtept')).map(p=>[p.hasAttribute('lon')?Number(p.getAttribute('lon')):NaN,p.hasAttribute('lat')?Number(p.getAttribute('lat')):NaN] as [number,number])).filter(p=>p.length>=2);
  }
  const root=JSON.parse(text), features=root.type==='FeatureCollection'?root.features:[root.type==='Feature'?root:{geometry:root}];
  return features.flatMap((f:{geometry?:{type:string;coordinates:[number,number][]|[number,number][][]}})=>f.geometry?.type==='LineString'?[f.geometry.coordinates]:f.geometry?.type==='MultiLineString'?f.geometry.coordinates:[]).map((points:number[][])=>points.map(p=>[p[0],p[1]]));
}
export default function TrailEditor({settings:s,onChange,onDraw,drawing}:{settings:Settings;onChange:(v:Partial<Settings>)=>void;onDraw:(id:string|null)=>void;drawing:string|null}) {
  const input=useRef<HTMLInputElement>(null);const [error,setError]=useState('');const [loading,setLoading]=useState(false);const [paths,setPaths]=useState<{id:string;name:string;points:[number,number][]}[]>([]);
  const update=(id:string,values:Partial<Trail>)=>onChange({trails:s.trails.map(t=>t.id===id?{...t,...values}:t)});
  function add(points:[number,number][],name:string) {
    const trail:Trail={id:crypto.randomUUID(),name:name.slice(0,64)||'Trail',points,style:'raised',width:1.6,height:.8};
    if(!validTrails([trail]))throw new Error('A route needs 2–10,000 valid longitude/latitude points.');
    if(s.trails.length>=20)throw new Error('Use at most 20 trails per map.');
    onChange({trails:[...s.trails,trail]});return trail.id;
  }
  return <div className="trail-editor"><p className="hint">Highlight a walk, cycle route or journey. Imported tracks and drawn routes are saved with the map and follow its terrain when printed.</p><input ref={input} hidden type="file" accept=".gpx,.geojson,.json" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>5*1024*1024)throw new Error('Choose a route file smaller than 5 MB.');const segments=parseRoute(await file.text(),file.name);if(!segments.length)throw new Error('No GPX track or GeoJSON line was found.');const name=file.name.replace(/\.[^.]+$/,'');const trails=segments.map((points,i):Trail=>({id:crypto.randomUUID(),name:(segments.length>1?`${name} ${i+1}`:name).slice(0,64)||'Trail',points,style:'raised',width:1.6,height:.8}));if(!validTrails([...s.trails,...trails]))throw new Error('Use at most 20 valid routes, each with 2–10,000 points.');onChange({trails:[...s.trails,...trails]});setError('');}catch(e){setError((e as Error).message);}}}/>
  <div className="trail-actions"><button type="button" onClick={()=>input.current?.click()}><Upload size={16}/>Import GPX / GeoJSON</button><button type="button" disabled={s.trails.length>=20} onClick={()=>onDraw('new')}><Pencil size={16}/>Draw on map</button></div>
  {drawing==='new'&&<p className="hint" role="status">Click at least two points on the map to start your route. Press Escape to cancel.</p>}
  <button type="button" disabled={loading||hostedWorkspace} onClick={async()=>{setLoading(true);setError('');try{const result=await api<{paths:typeof paths}>('/trails',s);setPaths(result.paths);if(!result.paths.length)setError('No mapped paths found in this area. Import or draw a route instead.');}catch(e){setError((e as Error).message);}finally{setLoading(false);}}}><Route size={16}/>{loading?'Loading mapped paths…':'Find mapped paths'}</button>
  {hostedWorkspace&&<p className="hint">Mapped-path downloads are available in the desktop app. Imports and drawing also work here.</p>}
  {error&&<p className="inline-error" role="alert">{error}</p>}
  {!!paths.length&&<details open className="advanced"><summary>Downloaded path sections · {paths.length}</summary><p className="hint">Each entry is a mapped section. Add sections to highlight a longer trail; imported GPX tracks can supply a complete journey.</p><div className="mapped-paths">{paths.map(p=><button type="button" key={p.id} onClick={()=>{try{add(p.points,p.name);setError('');}catch(e){setError((e as Error).message);}}}>{p.name} · Add section</button>)}</div></details>}
  {s.trails.map(t=><div className="trail-card" key={t.id}><label>Trail name<input value={t.name} maxLength={64} onChange={e=>update(t.id,{name:e.target.value})}/></label><div className="segmented"><button type="button" aria-pressed={t.style==='raised'} onClick={()=>update(t.id,{style:'raised'})}>Raised</button><button type="button" aria-pressed={t.style==='engraved'} onClick={()=>update(t.id,{style:'engraved'})}>Engraved</button></div><div className="two-col"><NumberField label="Trail width · mm" value={t.width} min={.8} max={8} step={.2} onChange={width=>update(t.id,{width})}/><NumberField label="Trail relief · mm" value={t.height} min={.2} max={2} step={.1} onChange={height=>update(t.id,{height})}/></div><small>{t.points.length} route points</small>{t.points.length>2&&<button type="button" onClick={()=>update(t.id,{points:t.points.slice(0,-1)})}>Remove last point</button>}<div className="trail-actions"><button type="button" onClick={()=>onDraw(drawing===t.id?null:t.id)}>{drawing===t.id?'Finish drawing':'Extend on map'}</button><button type="button" aria-label={`Delete trail ${t.name}`} onClick={()=>{if(drawing===t.id)onDraw(null);onChange({trails:s.trails.filter(p=>p.id!==t.id)});}}><Trash2 size={16}/></button></div></div>)}
  </div>;
}
