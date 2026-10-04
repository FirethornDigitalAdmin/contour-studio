import { fitArtworkBounds, longitudeSpan, wrapLongitude } from './world';
import type { Settings, MapTile } from './types';
export const collection = (s: Settings) => s.map_format === 'mini_tiles' || s.map_format === 'hexagons';
export const continuousWall = (s: Settings) => collection(s) && s.wall_mode === "continuous";
export const modularWall = (s: Settings) => collection(s) && !!s.wall_mode && s.wall_mode !== "legacy";
export function wallPositions(s: Settings): [number, number][] {
  return s.wall_positions?.length ? s.wall_positions : Array.from({length:s.collection_columns*s.collection_rows},(_,i)=>[Math.floor(i/s.collection_columns),i%s.collection_columns]);
}
export function collectionCells(s: Settings) {
  const edge=s.tile_size, gap=s.tile_gap;
  return wallPositions(s).map(([row,col])=>{
    const x=s.frame_width+edge/2+col*(s.map_format==='hexagons'?edge*.75+(modularWall(s)?Math.sqrt(3)/2*gap:gap):edge+gap);
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
  const positions=wallPositions(next);
  const count=positions.length;
  const resizing=(next.collection_columns!==s.collection_columns||next.collection_rows!==s.collection_rows)&&!('map_tiles' in changes);
  const map_tiles=Array.from({length:count},(_,i):MapTile=>{
    const [row,col]=positions[i];
    const previous=resizing ? (row<s.collection_rows&&col<s.collection_columns ? s.map_tiles[wallPositions(s).findIndex(([r,c])=>r===row&&c===col)] : undefined) : next.map_tiles[i];
    return previous??{id:crypto.randomUUID(),name:s.name,bounds:fitArtworkBounds(s.bounds,next.map_format==='hexagons'?2/Math.sqrt(3):1),markers:[],trails:[],custom_buildings:[],reference_image:null};
  });
  const retainedIndex=resizing ? map_tiles.findIndex(tile=>tile.id===s.map_tiles[s.active_tile]?.id) : next.active_tile;
  const active_tile=Math.min(Math.max(0,retainedIndex),count-1);
  const selected=map_tiles[active_tile];
  const switched=!continuousWall(next)&&active_tile!==next.active_tile?{name:selected.name,bounds:selected.bounds,markers:selected.markers,trails:selected.trails,custom_buildings:selected.custom_buildings??[],reference_image:selected.reference_image??null}:{};
  const dimensions=collectionDimensions(next);
  const geographic: Partial<Settings>={};
  if(continuousWall(next)) {
    const oldWidth=s.width-2*s.frame_width,oldHeight=s.height-2*s.frame_width;
    const newWidth=dimensions.width-2*next.frame_width,newHeight=dimensions.height-2*next.frame_width;
    if(continuousWall(s) && !('bounds' in changes) && (newWidth!==oldWidth||newHeight!==oldHeight)) {
      const project=(lat:number)=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
      const unproject=(y:number)=>(2*Math.atan(Math.exp(y))-Math.PI/2)*180/Math.PI;
      geographic.bounds={...s.bounds,east:wrapLongitude(s.bounds.west+longitudeSpan(s.bounds)*newWidth/oldWidth),north:unproject(project(s.bounds.south)+(project(s.bounds.north)-project(s.bounds.south))*newHeight/oldHeight)};
    } else if(!continuousWall(s)) geographic.bounds=fitArtworkBounds(next.bounds,newWidth/newHeight);
    if('bounds' in changes || 'map_format' in changes || 'tile_size' in changes) {geographic.elevation_reference=null;geographic.wall_scale=null;};
  }
  return {...changes,...switched,...dimensions,...geographic,map_tiles,active_tile,layout:'auto',joints:false,frame_contour:'flat',front_caption:false};
}
export function activeMapSettings(s: Settings): Settings {
  if(!collection(s))return s;
  if(continuousWall(s))return {...s,map_format:"artwork",width:s.width-2*s.frame_width,height:s.height-2*s.frame_width,frame_mode:"none",layout:"manual",columns:1,rows:1};
  return {...s,width:s.tile_size,height:s.map_format==='hexagons'?s.tile_size*Math.sqrt(3)/2:s.tile_size,frame_mode:'none',layout:'manual',columns:1,rows:1};
}

export function addWallTile(s: Settings, position: [number,number]): Partial<Settings> {
  const positions=wallPositions(s);
  if(positions.some(([r,c])=>r===position[0]&&c===position[1]) || positions.length>=36)return {};
  const nextPositions=[...positions,position];
  const tile: MapTile={id:crypto.randomUUID(),name:continuousWall(s)?s.name:'Choose a place',bounds:fitArtworkBounds(s.bounds,s.map_format==='hexagons'?2/Math.sqrt(3):1),markers:[],trails:[],custom_buildings:[],reference_image:null};
  return {wall_positions:nextPositions,collection_columns:Math.max(...nextPositions.map(p=>p[1]))+1,collection_rows:Math.max(...nextPositions.map(p=>p[0]))+1,map_tiles:[...s.map_tiles,tile],active_tile:s.map_tiles.length,...(!continuousWall(s)?{name:tile.name,bounds:tile.bounds,markers:[],trails:[],custom_buildings:[],reference_image:null}:{})};
}
export function wallAdditions(s: Settings): [number,number][] {
  const positions=wallPositions(s),occupied=new Set(positions.map(p=>p.join(','))),result=new Map<string,[number,number]>();
  for(const [r,c] of positions)for(const [dr,dc] of (s.map_format==='hexagons'?[[1,0],[-1,0],[0,1],[0,-1],[c%2?1:-1,1],[c%2?1:-1,-1]]:[[0,1],[1,0],[0,-1],[-1,0]])) {
    const p:[number,number]=[r+dr,c+dc];if(p[0]>=0&&p[1]>=0&&p[0]<6&&p[1]<6&&!occupied.has(p.join(',')))result.set(p.join(','),p);
  }
  return [...result.values()];
}
