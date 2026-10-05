import { collection, collectionDimensions, activeMapSettings, continuousWall, wallPositions } from "./formats";
import { validCustomBuildings, validReferenceImage } from "./tracing";
import { puzzleReach } from "./puzzle";
import { layout, type LocationMarker, type Settings } from "./types";

import { validBounds, insideBounds, longitudeOffset, longitudeSpan, polarArea } from "./world";

const limits: Partial<Record<keyof Settings, [number, number, boolean?]>> = {
  puzzle_seed:[1,9999,true], tile_size: [60,160], tile_gap: [4,20], collection_columns:[1,6,true], collection_rows:[1,6,true], active_tile:[0,35,true], magnet_diameter:[3,12], magnet_depth:[1,4], magnet_clearance:[.05,.5], puzzle_columns:[2,20,true], puzzle_rows:[1,20,true], puzzle_clearance:[.1,.6], puzzle_relief:[.2,3],
  artwork_rotation:[0,359], width: [30, 2000], height: [30, 2000], printer_width: [80, 1000],
  printer_height: [80, 1000], printer_z: [20, 1000], margin: [0, 30],
  columns: [1, 20, true], rows: [1, 20, true], base: [3, 20],
  land_variation: [0, 1], frame_clearance: [0.2, 5], exaggeration: [0.1, 30], smoothing: [0, 5], contour_height: [0.2, 10],
  facet_size: [3, 40], resolution: [64, 1024, true], seam: [0, 0.4],
  tolerance: [0.05, 0.5], frame_width: [4, 40], frame_depth: [3, 20],
  frame_height: [1, 60], corner_radius: [0, 15], inner_bevel: [0, 4],
  railway_width: [0.8, 8], railway_height: [0.2, 1.5],
  outer_bevel: [0, 4], road_width: [0.6, 5], road_height: [0.2, 3],
  water_width: [0.8, 8], water_depth: [0.2, 2], building_height: [2, 80],
  water_bank: [0, 3], tree_size: [1.2, 6], tree_height: [0.4, 5], tree_spacing: [1.5, 12],
  field_spacing: [1, 8], field_height: [0.2, 1.5], field_angle: [0, 180], colour_depth: [0.4, 2],
  building_exaggeration: [0.1, 10], building_min_width: [0.4, 4],
  building_min_height: [0.2, 10], nozzle: [0.2, 1], caption_size: [2, 12], plaque_width: [40, 250],
  marker_lon: [-180, 180], marker_lat: [-90, 90],
};
const choices: Partial<Record<keyof Settings, string[]>> = { artwork_shape:["rectangle","square","circle","oval","triangle","diamond","pentagon","hexagon","octagon","star","heart","letter"], wall_mode:["legacy","continuous","places"], puzzle_style:["classic","rounded"], map_format:["artwork","mini_tiles","hexagons","jigsaw"], mount_mode:["seat","magnets"], hang_mode:["none","keyholes","pucks","magnet_pucks"], caption_position:["bottom","top"], caption_style:["raised","engraved"], caption_font:["sans","serif"], caption_align:["left","centre","right"], plaque_shape:["rounded","rectangle","oval","ticket"], plaque_style:["raised","engraved"], plaque_font:["sans","serif"], frame_contour: ["flat", "minimum", "follow"], railway_style: ["bed", "tracks"], layout: ["auto", "manual"], terrain_style: ["smooth", "terraced", "sculpted", "faceted"], frame_mode: ["integrated", "separate", "none"], roads: ["raised", "engraved", "none"], building_source: ["combined", "osm"], building_style: ["realistic", "uniform", "stepped"], small_buildings: ["enhance", "keep", "omit"], water_style: ["carved", "smooth"], forest_style: ["canopy", "trees"], tree_type: ["broadleaf", "conifer", "mixed"], forest_grouping: ["groves", "even"], field_style: ["flat", "furrows", "rounded"] };
// Options added after the first release are absent from older saved designs.
const laterChoices = new Set(["artwork_shape", "wall_mode", "puzzle_style", "hang_mode", "caption_position", "caption_style", "caption_font", "caption_align", "plaque_shape", "plaque_style", "plaque_font"]);
const colourKeys: (keyof Settings)[] = ["colour_ground", "colour_water", "colour_forest", "colour_fields", "colour_roads", "colour_buildings", "colour_frame", "colour_markers"];
const validColour = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const heartY = Array.from({ length: 96 }, (_, i) => { const a = i * Math.PI * 2 / 96; return 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a); });
const heartHalfHeight = (Math.max(...heartY) - Math.min(...heartY)) / 64;

export function markerFitsMap(marker: LocationMarker, settings: Settings): boolean {
  const hex=settings.map_format==="hexagons" && !continuousWall(settings);
  settings=activeMapSettings(settings);
  const inset = settings.frame_mode === "none" ? 0 : settings.frame_width;
  const width = settings.width - 2 * inset, height = settings.height - 2 * inset;
  const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  const x = longitudeOffset(marker.lon,settings.bounds) / longitudeSpan(settings.bounds) * width;
  const latitudeY = polarArea(settings.bounds) ? (lat: number) => lat : mercator;
  const y = (latitudeY(marker.lat) - latitudeY(settings.bounds.south)) / (latitudeY(settings.bounds.north) - latitudeY(settings.bounds.south)) * height;
  const halfWidth = marker.size * (marker.symbol === "pin" ? 1 / 3 : 0.5);
  const halfHeight = marker.size * (marker.symbol === "heart" ? heartHalfHeight : marker.symbol === "star" ? 0.47552825814757677 : 0.5);
  if(hex&&[[x-halfWidth,y-halfHeight],[x+halfWidth,y-halfHeight],[x-halfWidth,y+halfHeight],[x+halfWidth,y+halfHeight]].some(([px,py])=>Math.abs(px-width/2)+Math.abs(py-height/2)/Math.sqrt(3)>width/2-.2))return false;
  return x - halfWidth >= 0.1 && x + halfWidth <= width - 0.1 && y - halfHeight >= 0.1 && y + halfHeight <= height - 0.1;
}

export function validSettingValue(key: keyof Settings, value: unknown, defaults: Settings): boolean {
  if (key === "artwork_letter") return typeof value === "string" && /^[A-Z]$/.test(value);
  if (typeof value !== typeof defaults[key]) return false;
  if (colourKeys.includes(key) && !validColour(value)) return false;
  const range = limits[key];
  if (range && (typeof value !== "number" || !Number.isFinite(value) || value < range[0] || value > range[1] || (range[2] && !Number.isInteger(value)))) return false;
  return !choices[key] || choices[key]!.includes(String(value));
}

// Drafts may contain a temporarily invalid layout. Preserve those edits so
// their validation messages can be repaired after reopening the workspace.
export function restoreDraft(value: unknown, defaults: Settings): Settings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const draft = value as Record<string, unknown>;
  // Expandable walls saved before mounting choices always had a rear keyhole.
  if (draft.hang_mode === undefined && (draft.wall_mode === "continuous" || draft.wall_mode === "places") && (draft.map_format === "mini_tiles" || draft.map_format === "hexagons")) draft.hang_mode = "keyholes";
  const next = { ...defaults, ...draft } as Settings;
  for (const [key, fallback] of Object.entries(defaults)) {
    if (key === "wall_positions" || key === "elevation_reference" || key === "wall_scale" || key === "bounds" || key === "markers" || key === "custom_buildings" || key === "reference_image" || key === "map_tiles" || key === "trails") continue;
    if (typeof next[key as keyof Settings] !== typeof fallback) return null;
    if (typeof fallback === "number" && !Number.isFinite(next[key as keyof Settings])) return null;
  }
  if (next.artwork_letter !== undefined && (typeof next.artwork_letter !== "string" || !/^[A-Z]$/.test(next.artwork_letter))) return null;
  if (next.elevation_reference != null && (typeof next.elevation_reference!=="number" || !Number.isFinite(next.elevation_reference)))return null;
  if(next.wall_positions && (!Array.isArray(next.wall_positions)||next.wall_positions.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isInteger(v)||v<0||v>5))))return null;
  if (!validTrails(next.trails ?? []) || !validMapTiles(next.map_tiles ?? [])) return null;
  if (!validCustomBuildings(next.custom_buildings ?? []) || !validReferenceImage(next.reference_image)) return null;
  if (!next.bounds || typeof next.bounds !== "object" || !["west", "south", "east", "north"].every((k) => typeof next.bounds[k as keyof typeof next.bounds] === "number" && Number.isFinite(next.bounds[k as keyof typeof next.bounds]))) return null;
  if (!Array.isArray(next.markers) || next.markers.length > 20 || next.markers.some((m) => !m || typeof m.id !== "string" || typeof m.label !== "string" || !["heart", "star", "pin"].includes(m.symbol) || ![m.lon, m.lat, m.size, m.rise].every((v) => typeof v === "number" && Number.isFinite(v)))) return null;
  if (Object.entries(choices).some(([key, values]) => !(laterChoices.has(key) && next[key as keyof Settings] === undefined) && !values.includes(String(next[key as keyof Settings])))) return null;
  if (colourKeys.some((key) => !validColour(next[key]))) return null;
  return Object.fromEntries(Object.keys(defaults).map((key) => [key, next[key as keyof Settings]])) as Settings;
}

export function validateDesign(s: Settings): string[] {
  const issues: string[] = [];
  if (s.project_type !== undefined && !["single", "modular", "jigsaw"].includes(s.project_type)) issues.push("Choose a valid project type.");
  if(!validTrails(s.trails))issues.push("Check trail names, coordinates and printable widths in Trails.");
  if(s.wall_positions?.length && (new Set(s.wall_positions.map(p=>p.join(","))).size!==s.wall_positions.length || s.wall_positions.some(([r,c])=>!Number.isInteger(r)||!Number.isInteger(c)||r<0||c<0||r>=s.collection_rows||c>=s.collection_columns)))issues.push("Choose unique tile positions inside the wall layout.");
  if(!validMapTiles(s.map_tiles))issues.push("Check each collection tile location.");
  if (s.artwork_shape && !choices.artwork_shape!.includes(s.artwork_shape)) issues.push("Choose a valid artwork shape.");
  if (s.artwork_letter !== undefined && !/^[A-Z]$/.test(s.artwork_letter)) issues.push("Choose one letter from A to Z.");
  const shaped = s.map_format === "artwork" && ((!['rectangle','square'].includes(s.artwork_shape ?? 'rectangle')) || (s.artwork_rotation ?? 0)%360!==0);
  if (shaped && (s.joints || s.labels || s.front_caption)) issues.push("Shaped artwork does not support joining keys or captions.");
  if (shaped && s.frame_mode!=="none" && (s.frame_contour!=="flat" || s.inner_bevel || s.outer_bevel)) issues.push("Shaped borders use a flat profile without bevels.");
  if(collection(s)) {
    const dimensions=collectionDimensions(s);
    if(Math.abs(dimensions.width-s.width)>.01||Math.abs(dimensions.height-s.height)>.01)issues.push("Check collection dimensions in Format.");
    for (const [i,tile] of (continuousWall(s)?[]:s.map_tiles).entries()) {
      if(validBounds(tile.bounds)&&validTrails(tile.trails)) {
        const tileSettings={...activeMapSettings(s),map_format:"artwork" as const,map_tiles:[],trails:tile.trails,markers:tile.markers,name:tile.name,bounds:tile.bounds};
        const tileIssues=validateDesign(tileSettings);
        if(tileIssues.length)issues.push(`Tile ${i+1}: ${tileIssues[0]}`);
      }
    }
    if(s.active_tile>=s.map_tiles.length)issues.push("Choose a valid active collection tile in Location.");
    if(s.map_tiles.length!==wallPositions(s).length)issues.push("Assign a location to every collection tile.");
    if(s.mount_mode==='magnets'&&s.base<s.magnet_depth+s.magnet_clearance+1.2)issues.push("Increase base thickness to leave 1.2 mm above the magnet pockets.");
  }
  if (s.hang_mode && s.hang_mode !== "none") {
    const pucks = s.hang_mode === "pucks" || s.hang_mode === "magnet_pucks";
    if (pucks && (!collection(s) || !s.wall_mode || s.wall_mode === "legacy")) issues.push("Wall pucks are for expandable tile walls. Choose keyhole slots in Wall mounting.");
    if (s.map_format === "artwork" && s.base < 4) issues.push("Keyhole slots need a base thickness of at least 4 mm.");
    if (s.map_format === "jigsaw" && (s.frame_mode === "none" || s.frame_depth < 4)) issues.push("Keyhole slots need a puzzle tray at least 4 mm thick. Increase the tray depth in Frame or choose No wall fixing.");
  }
  if(collection(s)) {
    if((s.map_format==='hexagons'||(s.wall_mode&&s.wall_mode!=='legacy'))&&s.tile_size+s.tile_gap*(s.map_format==='hexagons'&&s.wall_mode!=='legacy'?2/Math.sqrt(3):1)>Math.min(s.printer_width,s.printer_height)-2*s.margin)issues.push("Each hexagon holder must fit your usable build plate.");
  }
  if(s.map_format==='jigsaw') {
    const border=s.frame_mode==='none'?0:2*s.frame_width;
    const tw=(s.width-border)/s.puzzle_columns, th=(s.height-border)/s.puzzle_rows, reach=2*puzzleReach(tw,th,s.puzzle_style);
    if(Math.min(tw,th)<30)issues.push("Jigsaw pieces need at least 30 mm before tabs.");
    if(tw+reach>s.printer_width-2*s.margin||th+reach>s.printer_height-2*s.margin)issues.push("Jigsaw pieces including tabs must fit your printer. Increase piece count in Format.");
  }
  if (!validCustomBuildings(s.custom_buildings ?? [])) issues.push("Check added building outlines, names and heights in Add missing details.");
  if (!validReferenceImage(s.reference_image)) issues.push("Choose a valid reference image in Add missing details.");
  if (colourKeys.some((key) => !validColour(s[key]))) issues.push("Choose a valid six-digit colour for each print material.");
  if (!s.name.trim() || s.name.length > 64) issues.push("Give your artwork a name of 1–64 characters.");
  if ((s.caption_text ?? "").length > 80) issues.push("Keep frame lettering to 80 characters.");
  if ((s.plaque_title ?? "").length > 40 || (s.plaque_subtitle ?? "").length > 60 || (s.plaque_detail ?? "").length > 60) issues.push("Shorten the plaque text: 40 characters for the title, 60 for other lines.");
  if (s.plaque && (s.plaque_width ?? 90) > Math.min(s.printer_width, s.printer_height) - 2 * s.margin) issues.push("The plaque is wider than your build plate. Reduce its width in Frame.");
  for (const [key, values] of Object.entries(choices)) {
    if (laterChoices.has(key) && s[key as keyof Settings] === undefined) continue;
    if (!values.includes(String(s[key as keyof Settings]))) issues.push(`Choose a valid ${key.replaceAll("_", " ")} option.`);
  }
  for (const [key, range] of Object.entries(limits)) {
    if (key === "artwork_rotation" && s.artwork_rotation === undefined) continue;
    if (key === "puzzle_seed" && s.puzzle_seed === undefined) continue;
    if ((key === "caption_size" || key === "plaque_width") && s[key] === undefined) continue;
    const [min, max, integer] = range;
    const value = s[key as keyof Settings];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value)))
      issues.push(`${key.replaceAll("_", " ")}: enter ${integer ? "a whole number" : "a number"} between ${min} and ${max}.`);
  }
  const b = s.bounds;
  if (!validBounds(b)) issues.push("Select an area within −90…90° latitude, no larger than 2° per side. Date-line crossings are supported.");
  const grid = layout(s), tileWidth = s.width / grid.columns, tileHeight = s.height / grid.rows;
  if (grid.columns * grid.rows > 100 || grid.columns > 20 || grid.rows > 20 || !Number.isFinite(tileWidth) || !Number.isFinite(tileHeight))
    issues.push("Use at most 100 tiles, with no more than 20 rows or columns.");
  if (tileWidth > s.printer_width - 2 * s.margin + 0.000001 || tileHeight > s.printer_height - 2 * s.margin + 0.000001)
    issues.push("Every tile must fit your usable build plate. Increase rows or columns, or choose Automatic.");
  if (Math.min(tileWidth, tileHeight) < 30) issues.push("Every tile needs at least 30 mm on each side.");
  const recess = Math.max(s.water ? s.water_depth : 0, s.roads === "engraved" ? s.road_height : 0);
  if (s.base + recess > s.printer_z) issues.push("Base thickness and recessed features exceed your printer's build height.");
  if (s.frame_mode !== "none") {
    if (2 * s.frame_width >= Math.min(s.width, s.height) - 20) issues.push("Reduce the frame width to leave at least 20 mm for your map.");
    if (Math.min(tileWidth, tileHeight) - s.frame_width < 24) issues.push("Reduce the frame width or tile count to leave 24 mm of map on border tiles.");
    if (s.inner_bevel + s.outer_bevel >= s.frame_width) issues.push("Combined bevel widths must be smaller than the frame width.");
    if (s.corner_radius > s.frame_width) issues.push("The corner radius must not exceed the frame width.");
    if (Math.max(s.inner_bevel, s.outer_bevel) >= s.frame_depth + s.frame_height) issues.push("Bevels must be smaller than the total frame height.");
    if (s.frame_mode === "separate" && s.joints && s.frame_width < 6) issues.push("A separate frame with joining keys needs a border of at least 6 mm.");
    if (s.frame_contour !== "follow" && s.frame_depth + s.frame_height + (s.front_caption ? 0.55 : 0) > s.printer_z) issues.push("The frame and caption are taller than your printer's build height.");
  }
  if (s.markers.length > 20 || new Set(s.markers.map((m) => m.id)).size !== s.markers.length)
    issues.push("Use at most 20 special places with unique IDs.");
  if (s.markers.some((m) => !m.id.trim() || m.id.length > 64 || m.label.length > 64 || !["heart", "star", "pin"].includes(m.symbol) || ![m.lon, m.lat, m.size, m.rise].every(Number.isFinite) || m.lon < -180 || m.lon > 180 || m.lat < -90 || m.lat > 90 || m.size < 3 || m.size > 30 || m.rise < 0.5 || m.rise > 20))
    issues.push("Check each special place: use a 3–30 mm symbol, a 0.5–20 mm rise and valid coordinates.");
  if (s.markers.some((m) => !m.label.trim())) issues.push("Give each special place a name in Style.");
  if (s.markers.some((m) => !insideBounds(m.lon,m.lat,b)))
    issues.push("A special place is outside your selected area. Move it inside in Style.");
  else if (s.markers.some((m) => !markerFitsMap(m, s))) issues.push("A special place is too close to the map edge. Move it inward or reduce its size in Style.");
  if (s.marker && (!insideBounds(s.marker_lon,s.marker_lat,b)))
    issues.push("The location pin must be inside your selected area.");
  else if (s.marker && !markerFitsMap({ id: "legacy", label: "Location pin", symbol: "pin", lon: s.marker_lon, lat: s.marker_lat, size: 3.4, rise: 2 }, s)) issues.push("The location pin is too close to the map edge. Move it inward in Style.");
  return issues;
}

export function sameDesign(a: Settings, b: Settings): boolean {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]));
    return value;
  };
  const printable = (s: Settings) => {
    const { reference_image: _image, project_type: _type, project_name: _projectName, project_id: _projectId, ...rest } = s;
    const result={...rest,custom_buildings:s.custom_buildings??[],map_tiles:s.map_tiles.map(({reference_image:_tileImage,...tile})=>({...tile,custom_buildings:tile.custom_buildings??[]}))};
    if(collection(s)) {
      const {active_tile:_active,...withoutSelection}=result;
      if(!continuousWall(s)) {const {name:_name,bounds:_bounds,markers:_markers,trails:_trails,custom_buildings:_buildings,...geometry}=withoutSelection;return geometry;}
      return withoutSelection;
    }
    return result;
  };
  return JSON.stringify(canonical(printable(a))) === JSON.stringify(canonical(printable(b)));
}

export function validTrails(value: unknown): boolean {
  return Array.isArray(value)&&value.length<=20&&new Set(value.map(t=>t?.id)).size===value.length&&value.every(t=>t&&typeof t.id==='string'&&t.id.length>0&&t.id.length<=64&&typeof t.name==='string'&&t.name.trim().length>0&&t.name.length<=64&&['raised','engraved'].includes(t.style)&&Number.isFinite(t.width)&&t.width>=.8&&t.width<=8&&Number.isFinite(t.height)&&t.height>=.2&&t.height<=2&&Array.isArray(t.points)&&t.points.length>=2&&t.points.length<=10000&&t.points.every((p: unknown)=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90)&&new Set(t.points.map((p:number[])=>p.join(','))).size>=2);
}
export function validMapTiles(value: unknown): boolean {
  return Array.isArray(value)&&value.length<=36&&new Set(value.map(t=>t?.id)).size===value.length&&value.every(t=>t&&typeof t.id==='string'&&t.id.length>0&&typeof t.name==='string'&&t.name.trim().length>0&&t.name.length<=64&&validBounds(t.bounds)&&validTrails(t.trails)&&validCustomBuildings(t.custom_buildings??[])&&validReferenceImage(t.reference_image)&&Array.isArray(t.markers)&&t.markers.length<=20);
}
