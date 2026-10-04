import { fitArtworkBounds } from './world';
import type { Settings, MapTile } from './types';
export const collection = (s: Settings) => s.map_format === 'mini_tiles' || s.map_format === 'hexagons';
export function collectionCells(s: Settings) {
  const edge=s.tile_size, gap=s.tile_gap;
  return Array.from({length:s.collection_columns*s.collection_rows},(_,i)=>{
    const row=Math.floor(i/s.collection_columns),col=i%s.collection_columns;
    const x=s.frame_width+edge/2+col*(s.map_format==='hexagons'?edge*.75+gap:edge+gap);
    const y=s.frame_width+(s.map_format==='hexagons'?edge*Math.sqrt(3)/4:edge/2)+row*(s.map_format==='hexagons'?edge*Math.sqrt(3)/2+gap:edge+gap)+(s.map_format==='hexagons'&&col%2?edge*Math.sqrt(3)/4+gap/2:0);
    const points=s.map_format==='hexagons'?Array.from({length:6},(_,j)=>[x+edge/2*Math.cos(j*Math.PI/3),y+edge/2*Math.sin(j*Math.PI/3)]):[[x-edge/2,y-edge/2],[x+edge/2,y-edge/2],[x+edge/2,y+edge/2],[x-edge/2,y+edge/2]];
    return {row,col,x,y,points};
  });
}
export function collectionDimensions(s: Settings) {
  const cells=collectionCells(s);
  return {width:Math.max(...cells.flatMap(c=>c.points.map(p=>p[0])))+s.frame_width,height:Math.max(...cells.flatMap(c=>c.points.map(p=>p[1])))+s.frame_width};
}
export function resizeCollection(s: Settings, changes: Partial<Settings>): Partial<Settings> {
  const next={...s,...changes};
  if (!collection(next)) return changes;
  const count=next.collection_columns*next.collection_rows;
  const resizing=(next.collection_columns!==s.collection_columns||next.collection_rows!==s.collection_rows)&&!('map_tiles' in changes);
  const map_tiles=Array.from({length:count},(_,i):MapTile=>{
    const row=Math.floor(i/next.collection_columns), col=i%next.collection_columns;
    const previous=resizing ? (row<s.collection_rows&&col<s.collection_columns ? s.map_tiles[row*s.collection_columns+col] : undefined) : next.map_tiles[i];
    return previous??{id:crypto.randomUUID(),name:s.name,bounds:fitArtworkBounds(s.bounds,next.map_format==='hexagons'?2/Math.sqrt(3):1),markers:[],trails:[],custom_buildings:[],reference_image:null};
  });
  const retainedIndex=resizing ? map_tiles.findIndex(tile=>tile.id===s.map_tiles[s.active_tile]?.id) : next.active_tile;
  const active_tile=Math.min(Math.max(0,retainedIndex),count-1);
  const selected=map_tiles[active_tile];
  const switched=active_tile!==next.active_tile?{name:selected.name,bounds:selected.bounds,markers:selected.markers,trails:selected.trails,custom_buildings:selected.custom_buildings??[],reference_image:selected.reference_image??null}:{};
  return {...changes,...switched,...collectionDimensions(next),map_tiles,active_tile,layout:'auto',joints:false,frame_contour:'flat',front_caption:false};
}
export function activeMapSettings(s: Settings): Settings {
  if(!collection(s))return s;
  return {...s,width:s.tile_size,height:s.map_format==='hexagons'?s.tile_size*Math.sqrt(3)/2:s.tile_size,frame_mode:'none',layout:'manual',columns:1,rows:1};
}
