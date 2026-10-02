import { layout, type LocationMarker, type Settings } from "./types";

import { validBounds, insideBounds, longitudeOffset, longitudeSpan, polarArea } from "./world";

const limits: Partial<Record<keyof Settings, [number, number, boolean?]>> = {
  width: [60, 2000], height: [60, 2000], printer_width: [80, 1000],
  printer_height: [80, 1000], printer_z: [20, 1000], margin: [0, 30],
  columns: [1, 20, true], rows: [1, 20, true], base: [3, 20],
  exaggeration: [0.1, 30], smoothing: [0, 5], contour_height: [0.2, 10],
  facet_size: [3, 40], resolution: [64, 1024, true], seam: [0, 0.4],
  tolerance: [0.05, 0.5], frame_width: [4, 40], frame_depth: [3, 20],
  frame_height: [1, 60], corner_radius: [0, 15], inner_bevel: [0, 4],
  outer_bevel: [0, 4], road_width: [0.6, 5], road_height: [0.2, 3],
  water_width: [0.8, 8], water_depth: [0.2, 2], building_height: [2, 80],
  water_bank: [0, 3], tree_size: [1.2, 6], tree_height: [0.4, 5], tree_spacing: [1.5, 12],
  field_spacing: [1, 8], field_height: [0.2, 1.5], field_angle: [0, 180], colour_depth: [0.4, 2],
  building_exaggeration: [0.1, 10], building_min_width: [0.4, 4],
  building_min_height: [0.2, 10], nozzle: [0.2, 1],
  marker_lon: [-180, 180], marker_lat: [-90, 90],
};
const choices: Partial<Record<keyof Settings, string[]>> = { layout: ["auto", "manual"], terrain_style: ["smooth", "terraced", "sculpted", "faceted"], frame_mode: ["integrated", "separate", "none"], roads: ["raised", "engraved", "none"], building_source: ["combined", "osm"], building_style: ["realistic", "uniform", "stepped"], small_buildings: ["enhance", "keep", "omit"], water_style: ["carved", "smooth"], forest_style: ["canopy", "trees"], field_style: ["flat", "furrows"] };
const colourKeys: (keyof Settings)[] = ["colour_ground", "colour_water", "colour_forest", "colour_fields", "colour_roads", "colour_buildings", "colour_frame", "colour_markers"];
const validColour = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const heartY = Array.from({ length: 96 }, (_, i) => { const a = i * Math.PI * 2 / 96; return 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a); });
const heartHalfHeight = (Math.max(...heartY) - Math.min(...heartY)) / 64;

export function markerFitsMap(marker: LocationMarker, settings: Settings): boolean {
  const inset = settings.frame_mode === "none" ? 0 : settings.frame_width;
  const width = settings.width - 2 * inset, height = settings.height - 2 * inset;
  const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  const x = longitudeOffset(marker.lon,settings.bounds) / longitudeSpan(settings.bounds) * width;
  const latitudeY = polarArea(settings.bounds) ? (lat: number) => lat : mercator;
  const y = (latitudeY(marker.lat) - latitudeY(settings.bounds.south)) / (latitudeY(settings.bounds.north) - latitudeY(settings.bounds.south)) * height;
  const halfWidth = marker.size * (marker.symbol === "pin" ? 1 / 3 : 0.5);
  const halfHeight = marker.size * (marker.symbol === "heart" ? heartHalfHeight : marker.symbol === "star" ? 0.47552825814757677 : 0.5);
  return x - halfWidth >= 0.1 && x + halfWidth <= width - 0.1 && y - halfHeight >= 0.1 && y + halfHeight <= height - 0.1;
}

export function validSettingValue(key: keyof Settings, value: unknown, defaults: Settings): boolean {
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
  const next = { ...defaults, ...draft } as Settings;
  for (const [key, fallback] of Object.entries(defaults)) {
    if (key === "bounds" || key === "markers") continue;
    if (typeof next[key as keyof Settings] !== typeof fallback) return null;
    if (typeof fallback === "number" && !Number.isFinite(next[key as keyof Settings])) return null;
  }
  if (!next.bounds || typeof next.bounds !== "object" || !["west", "south", "east", "north"].every((k) => typeof next.bounds[k as keyof typeof next.bounds] === "number" && Number.isFinite(next.bounds[k as keyof typeof next.bounds]))) return null;
  if (!Array.isArray(next.markers) || next.markers.length > 20 || next.markers.some((m) => !m || typeof m.id !== "string" || typeof m.label !== "string" || !["heart", "star", "pin"].includes(m.symbol) || ![m.lon, m.lat, m.size, m.rise].every((v) => typeof v === "number" && Number.isFinite(v)))) return null;
  if (Object.entries(choices).some(([key, values]) => !values.includes(String(next[key as keyof Settings])))) return null;
  if (colourKeys.some((key) => !validColour(next[key]))) return null;
  return Object.fromEntries(Object.keys(defaults).map((key) => [key, next[key as keyof Settings]])) as Settings;
}

export function validateDesign(s: Settings): string[] {
  const issues: string[] = [];
  if (colourKeys.some((key) => !validColour(s[key]))) issues.push("Choose a valid six-digit colour for each print material.");
  if (!s.name.trim() || s.name.length > 64) issues.push("Give your artwork a name of 1–64 characters.");
  for (const [key, values] of Object.entries(choices)) {
    if (!values.includes(String(s[key as keyof Settings]))) issues.push(`Choose a valid ${key.replaceAll("_", " ")} option.`);
  }
  for (const [key, range] of Object.entries(limits)) {
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
    if (s.frame_depth + s.frame_height + (s.front_caption ? 0.55 : 0) > s.printer_z) issues.push("The frame and caption are taller than your printer's build height.");
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
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
