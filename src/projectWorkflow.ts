import { collection, resizeCollection } from './formats';
import { fitArtworkBounds } from './world';
import type { Settings } from './types';

export type ProjectType = 'single' | 'modular' | 'jigsaw';
export type WallContent = 'continuous' | 'places';
export const projectNames: Record<ProjectType, string> = { single: 'Single map', modular: 'Modular wall', jigsaw: 'Jigsaw puzzle' };
export const projectLabel=(s:Settings)=>s.wall_mode==='continuous'&&collection(s)?'Continuous tiled map':s.wall_mode==='places'&&collection(s)?'Collection of places':projectNames[projectType(s)];
export function projectType(s: Settings): ProjectType {
  return s.map_format === 'jigsaw' ? 'jigsaw' : collection(s) ? 'modular' : s.project_type === 'modular' ? 'modular' : 'single';
}
export function configureProject(s: Settings, type: ProjectType, content: WallContent = 'continuous', fresh = false, shape: 'mini_tiles' | 'hexagons' = 'mini_tiles'): Partial<Settings> {
  if (!fresh && projectType(s) === type && (type !== 'modular' || (s.wall_mode === content && s.map_format === shape))) return { project_type: type };
  const values: Partial<Settings> = { project_type: type };
  if (type === 'jigsaw') Object.assign(values, { map_format: 'jigsaw', hang_mode: 'none', frame_mode: 'separate', frame_depth: 3, frame_height: 1.5, frame_contour: 'flat', base: 3, joints: false, labels: false, front_caption: false, layout: 'auto', puzzle_style: "classic", puzzle_seed: 1, puzzle_columns: 4, puzzle_rows: 4, puzzle_relief: 1.2, ...(fresh ? { width: 200, height: 200 } : {}) });
  else if (type === 'modular') Object.assign(values, { map_format: shape, wall_mode: content, project_name: fresh ? (content==='continuous'?'My continuous map':'My places') : s.project_name, wall_positions: fresh || !collection(s) ? [[0,0]] : s.wall_positions, elevation_reference:null, wall_scale:null, frame_mode: 'separate', frame_contour: 'flat', frame_height: 3, frame_depth:4, mount_mode: 'seat', hang_mode: fresh || !collection(s) ? 'pucks' : s.hang_mode, joints: false, labels: false, front_caption: false, ...(fresh || !collection(s) ? { tile_size: 100, collection_columns: 1, collection_rows: 1, map_tiles:[],active_tile:0,resolution:128 } : {}) });
  else Object.assign(values, { map_format:'artwork',wall_mode:'legacy',hang_mode:s.hang_mode==='keyholes'&&s.base>=4?'keyholes':'none',frame_mode:s.frame_mode,frame_contour:'flat',joints:true,labels:true,layout:'auto',...(fresh?{width:200,height:200}:{}) });
  // Inactive collection locations remain in the design when switching formats.
  // Returning to a collection restores them rather than replacing them.
  const resized = resizeCollection(s, values);
  const next = { ...s, ...resized };
  if (collection(next) && next.wall_mode !== 'continuous') {
    if (!s.map_tiles.length && !fresh) next.map_tiles[0] = { ...next.map_tiles[0], markers: s.markers, trails: s.trails, custom_buildings: s.custom_buildings ?? [], reference_image: s.reference_image ?? null };
    const tile = next.map_tiles[next.active_tile];
    Object.assign(resized, { map_tiles: next.map_tiles, name: tile.name, bounds: tile.bounds, markers: tile.markers, trails: tile.trails, custom_buildings: tile.custom_buildings ?? [], reference_image: tile.reference_image ?? null });
  }
  if (!collection(next)) resized.bounds = fitArtworkBounds(next.bounds, (next.width - (next.frame_mode === 'none' ? 0 : 2 * next.frame_width)) / (next.height - (next.frame_mode === 'none' ? 0 : 2 * next.frame_width)));
  return resized;
}

export type SavedDesign = { id: string; updated: string; settings: Settings; jobId?: string; step: number; view: string; mapRatioLocked: boolean };
const storageKey = 'contour-studio.designs.v1';
export function readDesigns(): SavedDesign[] {
  try { const value = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(value) ? value.filter(d => d && typeof d.id === 'string' && typeof d.updated === 'string' && d.settings && typeof d.settings.name === 'string' && Number.isFinite(d.settings.width) && Number.isFinite(d.settings.height) && ['artwork','mini_tiles','hexagons','jigsaw'].includes(d.settings.map_format)) : []; }
  catch { return []; }
}
export function saveDesign(design: SavedDesign): SavedDesign[] {
  const designs = [design, ...readDesigns().filter(d => d.id !== design.id)];
  localStorage.setItem(storageKey, JSON.stringify(designs));
  return designs;
}

export type DeletedProject = { id: string; name: string; deleted: string; designs: SavedDesign[]; token?: string; jobId?: string; filesOnly: boolean };
export function readDeletedProjects(): DeletedProject[] {
  try { const data = JSON.parse(localStorage.getItem('contour-studio.trash.v1') || '[]'); return Array.isArray(data) ? data.filter(item => item && typeof item.id === 'string' && Array.isArray(item.designs)) : []; } catch { return []; }
}
export function writeDesigns(designs: SavedDesign[]) { localStorage.setItem(storageKey, JSON.stringify(designs)); }
export function writeDeletedProjects(items: DeletedProject[]) { localStorage.setItem('contour-studio.trash.v1', JSON.stringify(items)); }
