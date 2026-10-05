import { Grid2X2, Hexagon, Map, Puzzle, Shuffle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Settings } from './types';
import { collection, resizeCollection, continuousWall, modularWall } from './formats';
import { puzzlePresets } from './puzzle';
import { NumberField, Field } from './Controls';
import { tileSizes } from './tileSizes';
export default function FormatEditor({settings:s,onChange}:{settings:Settings;onChange:(v:Partial<Settings>)=>void}) {
  const update=(v:Partial<Settings>)=>onChange(resizeCollection(s,v));
  return <div className="control-block format-editor">
    {modularWall(s)&&<Field label="Project name"><input value={s.project_name||''} maxLength={64} placeholder="Name this ongoing project" onChange={event=>onChange({project_name:event.target.value})}/></Field>}
    {collection(s) && <><h3>Tile shape</h3><div className="segmented" role="group" aria-label="Tile shape"><button type="button" aria-pressed={s.map_format === 'mini_tiles'} onClick={() => update({ map_format: 'mini_tiles' })}><Grid2X2 size={17}/>Square</button><button type="button" aria-pressed={s.map_format === 'hexagons'} onClick={() => update({ map_format: 'hexagons' })}><Hexagon size={17}/>Hexagon</button></div></>}
    {s.map_format === 'artwork' && s.project_type === 'modular' && <><h3>Continuous map grid</h3><p className="hint">One map across joined tiles. The outer frame prints separately. Change the project type to use removable maps of different places.</p><div className="two-col"><NumberField label="Wall columns" value={s.columns} min={1} max={6} integer onChange={columns => onChange({ layout: 'manual', columns })}/><NumberField label="Wall rows" value={s.rows} min={1} max={6} integer onChange={rows => onChange({ layout: 'manual', rows })}/></div></>}
    {collection(s)&&<><p className="hint">{continuousWall(s)?"Choose one geographic area in Place. All inserts share the same map, details and colours.":"Choose a tile in Place or click it in the artwork layout. Its location and personal details stay with that tile; styles and colours apply across the wall."}</p><div className="segmented" role="group" aria-label="Tile size presets">{tileSizes.map(size=><button key={size.name} type="button" aria-pressed={s.tile_size===size.width} onClick={()=>update({tile_size:size.width})}>{size.name} · {size.width} mm</button>)}</div><div className="two-col">
      <NumberField label="Tile width · mm" value={s.tile_size} min={60} max={160} onChange={tile_size=>update({tile_size})}/>
      <NumberField label="Space between tiles · mm" value={s.tile_gap} min={4} max={20} onChange={tile_gap=>update({tile_gap})}/>
      {!modularWall(s)&&<><NumberField label="Collection columns" value={s.collection_columns} min={1} max={6} integer onChange={collection_columns=>update({collection_columns})}/>
      <NumberField label="Collection rows" value={s.collection_rows} min={1} max={6} integer onChange={collection_rows=>update({collection_rows})}/></>}
    </div><p className="hint" role="status">{s.map_tiles.length} maps · {s.width.toFixed(1)} × {s.height.toFixed(1)} mm overall. {modularWall(s)?'Each tile has its own keyed holder. Add adjoining tiles in the artwork layout.':s.map_format==='hexagons'?'Each hexagon has a matching holder.':'One surround holds the removable inserts; larger surrounds split for your printer.'}</p><p className="hint">{modularWall(s)?"This project grows one tile at a time. Keep tile size and shape consistent with pieces already printed.":"Adding rows or columns keeps your existing tiles in place. Reducing the grid removes outside tiles; Undo restores them."}</p></>}
    {s.map_format==='jigsaw'&&<>
      <h3><Puzzle size={18}/> Build your jigsaw</h3><p className="hint">Pick a challenge, then make the pattern your own. Your place continues across every piece.</p>
      <div className="puzzle-presets" role="group" aria-label="Puzzle difficulty">{puzzlePresets(s).map(p=><button type="button" key={p.label} aria-pressed={s.puzzle_columns===p.columns&&s.puzzle_rows===p.rows} onClick={()=>update({puzzle_columns:p.columns,puzzle_rows:p.rows})}><strong>{p.label}</strong><span>{p.count} pieces · {p.columns} × {p.rows}</span></button>)}</div>
      <div className="segmented" role="group" aria-label="Puzzle connectors"><button type="button" aria-pressed={s.puzzle_style==='classic'} onClick={()=>update({puzzle_style:'classic'})}>Classic jigsaw</button><button type="button" aria-pressed={(s.puzzle_style??'rounded')==='rounded'} onClick={()=>update({puzzle_style:'rounded'})}>Round knobs</button></div>
      {s.puzzle_style==='classic'&&<button type="button" className="puzzle-reshuffle" onClick={()=>update({puzzle_seed:(s.puzzle_seed??1)%9999+1})}><Shuffle size={16}/> Reshuffle piece pattern</button>}
      <p className="hint" role="status">{s.puzzle_columns*s.puzzle_rows} pieces · approximately {((s.width-(s.frame_mode==='none'?0:2*s.frame_width))/s.puzzle_columns).toFixed(1)} × {((s.height-(s.frame_mode==='none'?0:2*s.frame_width))/s.puzzle_rows).toFixed(1)} mm each before tabs. {s.puzzle_style==='classic'?`Pattern ${s.puzzle_seed??1} · every knob differs in size, position and direction, and the cut lines wander like a hand-cut puzzle.`:'Identical round knobs on a straight grid: easier to print and to solve.'}</p>
      <h3>Land height</h3><div className="segmented" role="group" aria-label="Puzzle land height">{[["Flat",.2],["Gentle",.6],["Hilly",1.2],["Bold",2.4]].map(([label,value])=><button type="button" key={label} aria-pressed={s.puzzle_relief===value} onClick={()=>update({puzzle_relief:value as number})}>{label}</button>)}</div>
      <label className="toggle-row"><input type="checkbox" checked={s.labels} onChange={event=>update({labels:event.target.checked})}/> Number each piece on the back (row-column)</label>
      <details className="advanced"><summary>Custom grid & height</summary><div className="two-col"><NumberField label="Puzzle columns" value={s.puzzle_columns} min={2} max={20} integer onChange={puzzle_columns=>update({puzzle_columns})}/><NumberField label="Puzzle rows" value={s.puzzle_rows} min={1} max={20} integer onChange={puzzle_rows=>update({puzzle_rows})}/></div><NumberField label="Land height · mm" value={s.puzzle_relief} min={.2} max={3} step={.1} onChange={puzzle_relief=>update({puzzle_relief})}/></details>
      <p className="hint">Pieces have a 3 mm base. Hills rise up to {s.puzzle_relief} mm; water is cut 0.6 mm deep, roads stand 0.4 mm and buildings 0.8 mm, so every feature prints as whole layers. Bottom edges are eased so first-layer squish does not jam the fit. Print the included puzzle-fit pair first.</p>
    </>}
  </div>;
}
export function TilePicker({settings:s,onChange}:{settings:Settings;onChange:(v:Partial<Settings>)=>void}) {
  if(!collection(s)||continuousWall(s))return null;
  return <div className="control-block tile-picker"><h3>Your wall tiles</h3><div className="tile-location-list">{s.map_tiles.map((tile,i)=><button type="button" key={tile.id} aria-pressed={s.active_tile===i} onClick={()=>onChange({active_tile:i,name:tile.name,bounds:tile.bounds,markers:tile.markers,trails:tile.trails,custom_buildings:tile.custom_buildings??[],reference_image:tile.reference_image??null})}><span>{i+1}</span><strong>{tile.name}</strong></button>)}</div><p className="hint">Editing tile {s.active_tile+1}. Choose its place below. Trails, markers and added buildings belong to this tile.</p></div>;
}
export function MountEditor({settings:s,onChange}:{settings:Settings;onChange:(v:Partial<Settings>)=>void}) {
  return <div className="control-block mount-editor"><h3>{s.map_format==='jigsaw'?'Puzzle tray':'Removable tile holders'}</h3><p className="hint">{modularWall(s)?'Every tile has an independent holder with rear joining-key sockets. Add compatible holders as the project grows; map inserts stay removable.':s.map_format==='hexagons'?'Matching hexagonal holders keep the tiles interchangeable. Glue holders to a backing board in your chosen arrangement.':s.map_format==='jigsaw'?'A flat tray and raised surround support the assembled pieces. Choose No frame for loose puzzle pieces.':'The collection surround has a supported seat for each map. Larger surrounds print as plates to glue onto a backing board.'}</p>
  {collection(s)&&<><div className="segmented" role="group" aria-label="Tile mounting"><button type="button" aria-pressed={s.mount_mode==='seat'} onClick={()=>onChange({mount_mode:'seat'})}>Lift-out seat</button><button type="button" aria-pressed={s.mount_mode==='magnets'} onClick={()=>onChange({mount_mode:'magnets',base:Math.max(s.base,s.magnet_depth+s.magnet_clearance+1.2)})}>Magnet pockets</button></div>{s.mount_mode==='magnets'&&<><div className="two-col"><NumberField label="Magnet diameter · mm" value={s.magnet_diameter} min={3} max={12} onChange={magnet_diameter=>onChange({magnet_diameter})}/><NumberField label="Magnet thickness · mm" value={s.magnet_depth} min={1} max={4} onChange={magnet_depth=>onChange({magnet_depth,base:Math.max(s.base,magnet_depth+s.magnet_clearance+1.2)})}/><NumberField label="Pocket allowance · mm" value={s.magnet_clearance} min={.05} max={.5} step={.05} onChange={magnet_clearance=>onChange({magnet_clearance})}/></div><p className="hint">Two blind pockets per tile and two per holder. Glue in disc magnets with matching polarity. Print Magnet_Fit first; magnets and adhesive are not supplied.</p></>}</>}
  {s.map_format==='jigsaw'&&<NumberField label="Puzzle seam clearance · mm" value={s.puzzle_clearance} min={.1} max={.6} step={.05} onChange={puzzle_clearance=>onChange({puzzle_clearance})}/>}
  </div>;
}

const hangChoices:{mode:NonNullable<Settings['hang_mode']>;label:string;text:string;walls?:boolean}[]=[
  {mode:'pucks',label:'Push-on wall pucks',text:'One screw per tile. Tiles push straight on, so you can add one anywhere later.',walls:true},
  {mode:'magnet_pucks',label:'Magnetic wall pucks',text:'As above, held by two magnets. Tiles lift off by hand.',walls:true},
  {mode:'keyholes',label:'Keyhole slots',text:'Slots in the back lower onto screw heads. Nothing extra to print.'},
  {mode:'none',label:'No wall fixing',text:'For a shelf, a stand, or your own backing board.'},
];
function MountDiagram({mode}:{mode:NonNullable<Settings['hang_mode']>}) {
  const puck=mode==='pucks'||mode==='magnet_pucks';
  return <svg viewBox="0 0 48 34" width="48" height="34" aria-hidden="true"><rect x="9" y="2" width="30" height="30" rx="3" fill="#eef2ea" stroke="#809285"/>
    {puck&&<><rect x="17" y="10" width="14" height="14" rx="2.5" fill="#fff" stroke="#344b40"/><circle cx="24" cy="17" r="2" fill="#344b40"/></>}
    {mode==='magnet_pucks'&&<><circle cx="24" cy="12.6" r="1.5" fill="#ac412b"/><circle cx="24" cy="21.4" r="1.5" fill="#ac412b"/></>}
    {mode==='keyholes'&&[16,32].map(x=><path key={x} d={`M${x-2.6},11 a2.6,2.6 0 1 0 5.2,0 l-1.1,-5 a1.5,1.5 0 0 0 -3,0 z`} fill="#fff" stroke="#344b40"/>)}
    {mode==='none'&&<path d="M15 26h18M19 22h10" stroke="#809285" strokeLinecap="round"/>}
  </svg>;
}
export function WallMountEditor({settings:s,onChange}:{settings:Settings;onChange:(v:Partial<Settings>)=>void}) {
  const walls=modularWall(s);
  if(collection(s)&&!walls)return null;
  const choices=hangChoices.filter(choice=>walls||!choice.walls);
  const pocket=s.magnet_depth+s.magnet_clearance;
  let detail:ReactNode=null;
  if(s.hang_mode==='pucks'||s.hang_mode==='magnet_pucks') detail=<>
    <p className="hint">Each holder has a square socket for a 30 mm wall puck. The square carries the tile and keeps it straight. Your print pack includes one puck per tile, a spacing jig that sets the next puck {((s.map_format==='hexagons'?s.tile_size*Math.sqrt(3)/2:s.tile_size)+s.tile_gap).toFixed(1)} mm from a mounted one, and a socket fit test. Use 3.5–4 mm countersunk screws.</p>
    {s.hang_mode==='magnet_pucks'&&<><div className="two-col"><NumberField label="Magnet diameter · mm" value={s.magnet_diameter} min={3} max={12} onChange={magnet_diameter=>onChange({magnet_diameter})}/><NumberField label="Magnet thickness · mm" value={s.magnet_depth} min={1} max={4} onChange={magnet_depth=>onChange({magnet_depth,...(s.mount_mode==='magnets'?{base:Math.max(s.base,magnet_depth+s.magnet_clearance+1.2)}:{})})}/></div><p className="hint">Four {s.magnet_diameter} × {s.magnet_depth} mm disc magnets per tile: two in the puck, two in the holder. Holders are {(Math.max(2.4,pocket+.4)+.2+pocket+(s.mount_mode==='magnets'?pocket:0)+1).toFixed(1)} mm thick to take them.</p></>}
    {s.mount_mode==='seat'&&<p className="settings-feedback">Lift-out maps are loose in their holders. On a wall, choose Magnet pockets below or glue each map into its holder.</p>}
  </>;
  else if(s.hang_mode==='keyholes') detail=<p className="hint">{walls?'One slot per holder for a screw with a head up to 6 mm. Each holder lowers 7 mm onto its screw, so new tiles can go beside or above mounted ones, not below.':s.map_format==='jigsaw'?'Two slots in the tray. Glue the finished puzzle into the tray before hanging. The tray needs to be at least 4 mm thick.':'Two slots in the top row, placed clear of seams, joining keys and labels. The assembly guide gives the exact screw spacing. Needs a base of at least 4 mm.'}{walls&&s.mount_mode==='seat'?' Lift-out maps are loose in their holders: use Magnet pockets or glue them in for a wall.':''}</p>;
  return <div className="control-block wall-mount-editor"><h3>Wall mounting</h3>
    <div className="mount-options" role="group" aria-label="Wall mounting">{choices.map(choice=><button type="button" key={choice.mode} aria-pressed={(s.hang_mode??'none')===choice.mode} onClick={()=>onChange({hang_mode:choice.mode,...(choice.mode==='keyholes'&&s.map_format==='jigsaw'&&s.frame_depth<4?{frame_depth:4.5}:{}),...(choice.mode==='keyholes'&&s.map_format==='artwork'&&s.base<4?{base:4}:{})})}><MountDiagram mode={choice.mode}/><span><strong>{choice.label}</strong><small>{choice.text}</small></span></button>)}</div>
    {detail}
  </div>;
}
