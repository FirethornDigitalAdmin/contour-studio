import { collection, resizeCollection } from './formats';
import { fitArtworkBounds } from './world';
import type { Settings } from './types';

export type ProjectType = 'single' | 'modular' | 'jigsaw';
export type WallContent = 'continuous' | 'places';
export const projectNames: Record<ProjectType, string> = { single: 'Single map', modular: 'Modular wall', jigsaw: 'Jigsaw puzzle' };
export function projectType(s: Settings): ProjectType {
  return s.map_format === 'jigsaw' ? 'jigsaw' : collection(s) ? 'modular' : s.project_type === 'modular' ? 'modular' : 'single';
}
export function configureProject(s: Settings, type: ProjectType, content: WallContent = 'continuous', fresh = false): Partial<Settings> {
  if (!fresh && projectType(s) === type && (type !== 'modular' || collection(s) === (content === 'places'))) return { project_type: type };
  const values: Partial<Settings> = { project_type: type };
  if (type === 'jigsaw') Object.assign(values, { map_format: 'jigsaw', frame_mode: 'separate', frame_depth: 3, frame_height: 1.5, frame_contour: 'flat', base: 3, joints: false, labels: false, front_caption: false, layout: 'auto', puzzle_style: "classic", puzzle_seed: 1, puzzle_columns: 4, puzzle_rows: 4, puzzle_relief: .6, ...(fresh ? { width: 200, height: 200 } : {}) });
  else if (type === 'modular' && content === 'places') Object.assign(values, { map_format: 'mini_tiles', frame_mode: 'separate', frame_contour: 'flat', frame_height: 3, mount_mode: 'seat', joints: false, labels: false, front_caption: false, ...(fresh ? { tile_size: 100, collection_columns: 2, collection_rows: 2 } : {}) });
  else Object.assign(values, { map_format: 'artwork', frame_mode: type === 'modular' ? 'separate' : s.frame_mode, frame_contour: 'flat', joints: true, labels: true, layout: type === 'modular' ? 'manual' : 'auto', ...(type === 'modular' ? { columns: fresh ? 3 : s.columns, rows: fresh ? 2 : s.rows } : {}), ...(fresh ? { width: type === 'single' ? 200 : 480, height: type === 'single' ? 200 : 320 } : {}) });
  // Inactive collection locations remain in the design when switching formats.
  // Returning to a collection restores them rather than replacing them.
  const resized = resizeCollection(s, values);
  const next = { ...s, ...resized };
  if (collection(next)) {
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
