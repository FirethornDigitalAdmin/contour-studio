import { useEffect, useRef, useState } from 'react';
import { Boxes, Link2, PanelTop, Hexagon, Square, Tag, Download, RotateCcw } from 'lucide-react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { plaque3MF } from './asset3mf';
import { tileSizes } from './tileSizes';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { assetDefaults, assetError, assetGeometry, assetSource, assetSTL, plaqueMaterials, geometrySTL, type AssetKind, type AssetOptions } from './assetGeometry';
import fontLicence from './assets/FONT-LICENSE.txt?raw';
import './assets-page.css';

const catalogue = [
  {id:'key',name:'Joining key',category:'Connectors',icon:Link2,description:'A spare removable key for Contour’s expandable tile holders.',note:'Default 10 × 6 × 1.8 mm matches expandable wall holders. Artwork joining keys use 1.6 mm thickness. Keys align pieces; fix each holder independently.'},
  {id:'bridge',name:'Joining plate',category:'Connectors',icon:Link2,description:'A flat two-hole bridge for a backing board or your own tile assembly.',note:'Attach across a seam using suitable screws or adhesive. For custom screw-fastened assemblies on a backing board; not needed for Contour’s keyed tile bases. Hole centres are 8 mm from each end.'},
  {id:'mount',name:'Mounting plate',category:'Mounts',icon:PanelTop,description:'A two-hole plate for your own backing or display arrangement.',note:'For custom displays on a backing board. Contour’s tile bases already have a hanging keyhole. Hole centres are 10 mm from the top and bottom. Choose fixings for your backing and wall. Load capacity and physical fit have not been tested.'},
  {id:'square',name:'Square blank + base',category:'Blanks',icon:Square,description:'A removable square blank with its matching keyed tile base.',note:'Matches standard expandable square holders: 6 mm gap, 0.2 mm clearance, 4 mm seat and 3 mm rim. The base includes rear key sockets and a hanging keyhole. Match these dimensions to your existing tiles.'},
  {id:'hex',name:'Hexagonal blank + base',category:'Blanks',icon:Hexagon,description:'Extend your hex display with a blank insert and matching keyed base.',note:'Width is point to point. Matches standard expandable hex holders: 6 mm gap, 0.2 mm clearance, 4 mm seat and 3 mm rim. Includes rear key sockets and a hanging keyhole; check the size against your existing tiles.'},
  {id:'plaque',name:'Custom plaque',category:'Plaques',icon:Tag,description:'Add a place name, date or a short dedication to your print.',note:'Choose engraved, raised or flush colour-inlaid lettering. Text fits within the selected plaque shape. Print face up and attach with a suitable adhesive.'},
] as const;
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
function AssetPreview({kind,options}:{kind:AssetKind;options:AssetOptions}) {
  const host = useRef<HTMLDivElement>(null);
  const [failed,setFailed] = useState(false);
  useEffect(() => {
    const container = host.current!; let renderer: THREE.WebGLRenderer;
    setFailed(false);
    try { renderer = new THREE.WebGLRenderer({antialias:true,alpha:true}); } catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio,2)); container.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); const group=new THREE.Group(); scene.add(group);
    const geometries:THREE.BufferGeometry[]=[],materials:THREE.MeshStandardMaterial[]=[];
    const add=(geometry:THREE.BufferGeometry,colour:string,z=0)=>{const material=new THREE.MeshStandardMaterial({color:colour,roughness:.65,metalness:.05});const mesh=new THREE.Mesh(geometry,material);mesh.position.z=z;group.add(mesh);geometries.push(geometry);materials.push(material);};
    if(kind==='plaque' && options.letterMode==='ams') plaqueMaterials(options).forEach(p=>add(p.geometry,p.colour));
    else add(assetGeometry(kind,options),kind==='plaque'?(options.baseColour||'#729080'):'#729080',(kind==='hex'||kind==='square')?4:0);
    const bounds=new THREE.Box3().setFromObject(group); const centre=bounds.getCenter(new THREE.Vector3());
    group.position.sub(centre);
    scene.add(new THREE.HemisphereLight(0xffffff,0x475646,3));
    const light=new THREE.DirectionalLight(0xffffff,3); light.position.set(-50,70,100); scene.add(light);
    const size=bounds.getSize(new THREE.Vector3()).length(); const camera=new THREE.PerspectiveCamera(35,1,.1,size*20);
    camera.up.set(0,0,1); camera.position.set(size*.35,-size*.9,size*1.3);
    const controls=new OrbitControls(camera,renderer.domElement); controls.enablePan=false; controls.minDistance=size*.5; controls.maxDistance=size*4;
    const render=() => renderer.render(scene,camera);
    const abort=new AbortController();
    if(kind==='hex'||kind==='square') fetch(`accessories/${kind}-${options.width}-base.stl`,{signal:abort.signal}).then(r=>{if(!r.ok)throw new Error('Base preview unavailable');return r.arrayBuffer();}).then(data=>{if(abort.signal.aborted)return;add(new STLLoader().parse(data),'#c8b996');render();}).catch(()=>{if(!abort.signal.aborted)setFailed(true);}); controls.addEventListener('change',render); controls.update();
    const observer=new ResizeObserver(() => { const w=container.clientWidth,h=container.clientHeight; renderer.setSize(w,h); camera.aspect=w/h; camera.updateProjectionMatrix(); render(); }); observer.observe(container);
    return () => {abort.abort();observer.disconnect();controls.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.domElement.remove();};
  },[kind,options]);
  return <div className="asset-preview" ref={host} role="img" aria-label={`${kind} 3D preview`}>{failed && <p>3D preview is unavailable on this device. Your files can still be downloaded.</p>}<span>Drag to rotate · scroll to zoom</span></div>;
}
export default function AssetsPage() {
  const [kind,setKind]=useState<AssetKind>('key');
  const [category,setCategory]=useState('All assets');
  const [query,setQuery]=useState('');
  const [options,setOptions]=useState<Record<AssetKind,AssetOptions>>(() => {
    try { const saved=JSON.parse(localStorage.getItem('contour.assets.v2') || 'null'); const result={...assetDefaults}; for (const k of Object.keys(result) as AssetKind[]) if (saved?.[k] && !assetError(k,saved[k])) result[k]={...result[k],...saved[k]}; return result; } catch {return {...assetDefaults};}
  });
  const [status,setStatus]=useState('');
  const [downloading,setDownloading]=useState(false);
  useEffect(() => {try {localStorage.setItem('contour.assets.v2',JSON.stringify(options));} catch {/* Downloads work without storage. */}},[options]);
  const asset=catalogue.find(a=>a.id===kind)!; const o=options[kind]; const error=assetError(kind,o);
  const blank=kind==='hex'||kind==='square';const ams=kind==='plaque'&&o.letterMode==='ams';
  const update=(values:Partial<AssetOptions>)=>{setStatus('');setOptions(current=>({...current,[kind]:{...current[kind],...values}}));};
  const visible=catalogue.filter(a=>(category==='All assets'||a.category===category)&&`${a.name} ${a.description}`.toLowerCase().includes(query.toLowerCase()));
  const file=(format:'stl'|'scad'|'3mf')=>{try {download(format==='3mf'?plaque3MF(o):format==='stl'?assetSTL(kind,o):new Blob([assetSource(kind,o)],{type:'text/plain'}),`contour-${kind}-${o.width}mm.${format}`);setStatus(`${format.toUpperCase()} downloaded. Open it in your own slicer or editor.`);} catch(e) {setStatus((e as Error).message);}};
  const baseFile=async(format:'stl'|'zip')=>{setDownloading(true);try{const suffix=format==='zip'?'kit.zip':'base.stl';const response=await fetch(`accessories/${kind}-${o.width}-${suffix}`);if(!response.ok)throw new Error('Could not download this base. Try again.');download(await response.blob(),`contour-${kind}-${o.width}mm-${suffix}`);setStatus('Downloaded the matching tile base. Print rear-down and test the fit.');}catch(e){setStatus((e as Error).message);}finally{setDownloading(false);}};
  const materialFile=(index:number)=>{const parts=plaqueMaterials(o);download(geometrySTL(parts[index].geometry),`contour-plaque-${index?'lettering':'base'}.stl`);parts.forEach(p=>p.geometry.dispose());setStatus('Import both material STLs together as parts of one object; keep their shared origin.');};
  return <main className="assets-page" id="workspace">
    <header className="assets-intro"><span className="eyebrow"><Boxes size={16}/> The accessory library</span><h1>Small pieces. More possibilities.</h1><p>Connect, display and personalise your prints. Make as many as you need, with your own printer, material and slicer settings.</p></header>
    <div className="assets-toolbar"><label><span className="sr-only">Search assets</span><input type="search" placeholder="Search accessories…" value={query} onChange={e=>setQuery(e.target.value)}/></label><div role="group" aria-label="Asset categories">{['All assets','Connectors','Mounts','Blanks','Plaques'].map(c=><button key={c} aria-pressed={category===c} onClick={()=>setCategory(c)}>{c}</button>)}</div></div>
    <div className="assets-layout"><section className="asset-catalogue" aria-label="Reusable assets">{visible.map(a=><button key={a.id} className="asset-card" aria-pressed={kind===a.id} onClick={()=>{setKind(a.id);setStatus('');}}><div className={`asset-card-art asset-art-${a.id}`}><a.icon size={48} strokeWidth={1.2}/></div><span className="eyebrow">{a.category}</span><h2>{a.name}</h2><p>{a.description}</p><span className="asset-card-link">Customise & download</span></button>)}{!visible.length&&<p className="asset-empty">No matching assets. Try another search or category.</p>}</section>
      <section className="asset-detail" aria-label="Customise asset"><span className="eyebrow">Make it your own</span><h2>{asset.name}</h2>{!error&&<AssetPreview kind={kind} options={o}/>}{!error && <p className="asset-dimensions">{o.width} × {(kind==='hex'?o.width*Math.sqrt(3)/2:o.height).toFixed(1)} × {o.thickness} mm</p>}
      {blank&&<><div className="asset-size-presets" role="group" aria-label="Blank tile size">{tileSizes.map(size=><button key={size.name} aria-pressed={o.width===size.width} onClick={()=>update({width:size.width,height:kind==='hex'?size.width*Math.sqrt(3)/2:size.width})}><strong>{size.name}</strong><span>{size.width} mm</span></button>)}</div><p className="asset-fit-note">A blank insert plus a separate supporting base, using the same holder geometry as expandable map tiles. The kit also includes a joining key and editable source.</p></>}
      {kind==='plaque'&&<><label className="asset-text">Plaque shape<select value={o.plaqueStyle||'rectangle'} onChange={e=>update({plaqueStyle:e.target.value as AssetOptions['plaqueStyle']})}>{[['heritage','Heritage plaque'],['rounded','Rounded plaque'],['oval','Oval'],['shield','Shield'],['rectangle','Rectangle']].map(([value,name])=><option key={value} value={value}>{name}</option>)}</select></label><div className="asset-size-presets" role="group" aria-label="Plaque lettering">{[['engraved','Engraved'],['raised','Raised'],['ams','AMS multicolour']].map(([value,name])=><button key={value} aria-pressed={(o.letterMode||'engraved')===value} onClick={()=>update({letterMode:value as AssetOptions['letterMode']})}>{name}</button>)}</div></>}
      <div className="asset-fields">{([...(blank?[]:['width','height']),'thickness',...(['bridge','mount'].includes(kind)?['hole']:[])] as (keyof AssetOptions)[]).map(field=><label key={field}>{field==='hole'?'Hole diameter':field[0].toUpperCase()+field.slice(1)} · mm<input type="number" step={(field==='thickness'||field==='hole') ? 0.1 : 1} value={typeof o[field] === 'number' && !Number.isFinite(o[field]) ? '' : o[field]} min={field==='thickness'?1:field==='hole'?2:field==='height'?6:10} max={field==='thickness'?12:field==='hole'?6:300} onChange={e=>update({[field]:e.target.value===''?NaN:Number(e.target.value)})}/></label>)}</div>
      {kind==='plaque'&&<label className="asset-text">Plaque text<input value={o.text} maxLength={48} placeholder="Your place, date or dedication" onChange={e=>update({text:e.target.value})}/><small>Up to 48 characters · leave blank for a plain plaque</small></label>}
      {ams&&<><div className="asset-fields asset-colours"><label>Base colour · filament 1<input type="color" value={o.baseColour||'#355747'} onChange={e=>update({baseColour:e.target.value})}/></label><label>Lettering · filament 2<input type="color" value={o.textColour||'#e9d4a4'} onChange={e=>update({textColour:e.target.value})}/></label></div><p className="asset-fit-note">The 3MF keeps the base and flush lettering as separate colour volumes in one object. Import as a multipart model, then map filament 1 and 2 to your AMS slots and choose your printer and print settings. Colours are previews, not physical slot assignments.</p></>}
      {error&&<p role="alert" className="asset-error">{error}</p>}<p className="asset-fit-note">{asset.note}</p>
      <div className="asset-downloads"><button className="primary" disabled={!!error} onClick={()=>file(ams?'3mf':'stl')}><Download size={17}/>{ams?'Download colour 3MF':blank?'Download blank STL':'Download STL'}</button>{blank&&<><button disabled={downloading||!!error} onClick={()=>void baseFile('stl')}>Download matching base STL</button><button disabled={downloading||!!error||o.thickness!==4} onClick={()=>void baseFile('zip')}>Download complete tile kit (.zip)</button>{o.thickness!==4&&<small>The standard kit has a 4 mm blank. Download your custom blank and the base separately.</small>}</>}{ams&&<div className="asset-material-downloads"><button disabled={!!error} onClick={()=>materialFile(0)}>Base STL · filament 1</button><button disabled={!!error} onClick={()=>materialFile(1)}>Lettering STL · filament 2</button></div>}<button disabled={!!error} onClick={()=>file('scad')}>Editable source (.scad)</button><button onClick={()=>update({...assetDefaults[kind]})}><RotateCcw size={14}/>Reset dimensions</button></div><p role="status" className="asset-status">{status}</p>
      </section></div>
    <section className="assets-freedom"><div><h2>Print it your way.</h2><p>STL files use millimetres and include no printer profile. Arrange copies on your build plate, choose your material and set your own quality. Open the editable OpenSCAD source to change the design further; plaque fonts may differ in your editor.</p></div><div><h3>Free to make and adapt</h3><p>These accessory designs can be printed, modified and shared, including commercially. Start with a small fit test when joining parts. Custom dimensions change the fit; physical fit and mounting strength remain untested.</p><button onClick={()=>download(new Blob([fontLicence],{type:'text/plain'}),'contour-plaque-font-licence.txt')}>Plaque font licence</button></div></section>
  </main>;
}
