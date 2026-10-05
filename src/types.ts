export type Bounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};
export type LocationMarker = {
  id: string; label: string; symbol: "heart" | "star" | "pin";
  lon: number; lat: number; size: number; rise: number;
};
export type CustomBuilding = { id: string; label: string; height: number; points: [number, number][] };
export type ReferenceImage = { data: string; bounds: Bounds; x: number; y: number; width: number; aspect: number; rotation: number; opacity: number };
export type Trail = { id: string; name: string; points: [number,number][]; style: "raised" | "engraved"; width: number; height: number };
export type MapTile = { id: string; name: string; bounds: Bounds; markers: LocationMarker[]; trails: Trail[]; custom_buildings?: CustomBuilding[]; reference_image?: ReferenceImage | null };
export type Settings = {
  project_type?: "single" | "modular" | "jigsaw";
  map_format: "artwork" | "mini_tiles" | "hexagons" | "jigsaw";
  artwork_rotation?: number;
  artwork_shape?: import("./artworkShapes").ArtworkShape; artwork_letter?: string;
  project_id?: string; project_name?: string;
  wall_mode?: "legacy" | "continuous" | "places"; wall_positions?: [number,number][]; wall_scale?: number | null; elevation_reference?: number | null;
  tile_size: number; tile_gap: number; collection_columns: number; collection_rows: number;
  map_tiles: MapTile[]; active_tile: number;
  hang_mode?: "none" | "keyholes" | "pucks" | "magnet_pucks";
  mount_mode: "seat" | "magnets"; magnet_diameter: number; magnet_depth: number; magnet_clearance: number;
  puzzle_style?: "classic" | "rounded"; puzzle_seed?: number;
  puzzle_columns: number; puzzle_rows: number; puzzle_clearance: number; puzzle_relief: number;
  trails: Trail[];
  custom_buildings?: CustomBuilding[];
  reference_image?: ReferenceImage | null;
  name: string;
  bounds: Bounds;
  width: number;
  height: number;
  printer_model: string;
  printer_width: number;
  printer_height: number;
  printer_z: number;
  margin: number;
  layout: "auto" | "manual";
  columns: number;
  rows: number;
  base: number;
  exaggeration: number;
  land_variation: number;
  smoothing: number;
  terrain_style: "smooth" | "terraced" | "sculpted" | "faceted";
  contour_height: number;
  facet_size: number;
  resolution: number;
  seam: number;
  joints: boolean;
  tolerance: number;
  labels: boolean;
  frame_mode: "integrated" | "separate" | "none";
  frame_contour: "flat" | "minimum" | "follow";
  frame_clearance: number;
  frame_width: number;
  frame_depth: number;
  frame_height: number;
  corner_radius: number;
  inner_bevel: number;
  outer_bevel: number;
  roads: "raised" | "engraved" | "none";
  road_width: number;
  road_height: number;
  water: boolean;
  water_width: number;
  water_depth: number;
  water_style: "carved" | "smooth";
  water_bank: number;
  forests: boolean;
  forest_style: "canopy" | "trees";
  tree_type: "broadleaf" | "conifer" | "mixed";
  forest_grouping: "groves" | "even";
  tree_size: number;
  tree_height: number;
  tree_spacing: number;
  fields: boolean;
  field_style: "flat" | "furrows" | "rounded";
  field_spacing: number;
  field_height: number;
  field_angle: number;
  multicolour: boolean;
  colour_depth: number;
  colour_ground: string;
  colour_water: string;
  colour_forest: string;
  colour_fields: string;
  colour_roads: string;
  colour_buildings: string;
  colour_frame: string;
  colour_markers: string;
  railways: boolean;
  railway_style: "bed" | "tracks";
  railway_width: number;
  railway_height: number;
  road_hierarchy: boolean;
  urban_spaces: boolean;
  supported_crossings: boolean;
  bridge_openings: boolean;
  preserve_building_gaps: boolean;
  building_type_heights: boolean;
  buildings: boolean;
  building_source: "combined" | "osm";
  building_height: number;
  building_exaggeration: number;
  small_buildings: "enhance" | "keep" | "omit";
  building_min_width: number;
  building_min_height: number;
  building_style: "realistic" | "uniform" | "stepped";
  markers: LocationMarker[];
  landmarks: boolean;
  marker: boolean;
  marker_lon: number;
  marker_lat: number;
  front_caption: boolean;
  caption_text?: string; caption_position?: "bottom" | "top"; caption_style?: "raised" | "engraved"; caption_font?: "sans" | "serif"; caption_align?: "left" | "centre" | "right"; caption_size?: number;
  plaque?: boolean; plaque_title?: string; plaque_subtitle?: string; plaque_detail?: string; plaque_coordinates?: boolean; plaque_capitals?: boolean;
  plaque_shape?: "rounded" | "rectangle" | "oval" | "ticket"; plaque_style?: "raised" | "engraved"; plaque_font?: "sans" | "serif"; plaque_border?: boolean; plaque_width?: number;
  nozzle: number;
};
export type Part = {
  id: string;
  kind: "terrain" | "frame" | "key" | "coupon";
  file: string;
  dimensions_mm: number[];
  triangles: number;
  watertight: boolean;
  row?: number;
  column?: number;
  quantity?: number;
  neighbours: Record<string, string | null>;
  warnings: string[];
  multicolour_file?: string;
};
export type MaterialId = "ground" | "water" | "forest" | "fields" | "roads" | "buildings" | "frame" | "markers";
export type PrintMaterial = { id: MaterialId; name: string; colour: string; filament: number };
export type MulticolourTile = {
  part_id: string; file: string;
  materials: (PrintMaterial & { file: string; volume_mm3: number })[];
};
export type BambuProfile = { printer: string | null; process: string | null; filament: string | null; layer_height: number };
export type Model = {
  bambu?: { files: string[]; plate_count: number; piece_count: number; nozzle?: number; profile?: BambuProfile };
  name: string;
  settings: Settings;
  layout: { columns: number; rows: number };
  parts: Part[];
  multicolour?: { enabled: boolean; palette: PrintMaterial[]; tiles: MulticolourTile[]; instructions: string[] };
  model: {
    colour_method?: string | null;
    warnings: string[];
    elevation_m: number[];
    land_height_mm?: number[];
    frame_height_mm?: number[] | null;
    features: Record<string, number>;
    joints: unknown[];
    grid_spacing_mm: number[];
    geometry_revision?: string;
    mounting?: { mode: NonNullable<Settings["hang_mode"]>; screw: string; pucks?: number; pitch_mm?: number; magnets?: number; keyholes_mm?: number[][]; screw_spacing_mm?: number } | null;
    frame_fit?: {
      lip_width_mm: number;
      lip_height_mm: number;
      clearance_mm: number;
      assembly: string;
      seat_angle_degrees?: number;
    } | null;
    city_method?: string;
    terrain_method?: "contour-bands" | "heightfield";
  };
  sources: {
    elevation: { provider: string; url: string };
    vectors: {
      provider: string; url: string;
      tree_canopy?: { provider: string; url: string; status: string; attribution: string; features: number };
      buildings?: { added_buildings: number; osm_buildings: number; release: string; url: string };
    };
  };
};
export type Job = {
  id: string;
  status: "queued" | "running" | "complete" | "failed";
  progress: number;
  message: string;
  settings?: Settings;
  result?: Model;
};
export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}
export function layout(s: Settings) {
  return s.layout === "auto"
    ? {
        columns: Math.ceil(s.width / (s.printer_width - 2 * s.margin)),
        rows: Math.ceil(s.height / (s.printer_height - 2 * s.margin)),
      }
    : { columns: s.columns, rows: s.rows };
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const r = await fetch("/api" + path, {
      signal: controller.signal,
      ...(body !== undefined ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        } : {}),
    });
    let data;
    try { data = await r.json(); }
    catch {
      if (r.ok) throw new Error("The local app returned an unreadable response. Please restart it and try again.");
      data = null;
    }
    if (!r.ok) throw new ApiError(
      typeof data?.detail === "string"
        ? data.detail
        : Array.isArray(data?.detail)
          ? data.detail.map((e: { msg: string; loc?: (string | number)[] }) => {
              const field = e.loc?.filter((v) => v !== "body").join(" · ").replaceAll("_", " ");
              return `${field ? field + ": " : ""}${e.msg.replace(/^Value error, /, "")}`;
            }).join("; ")
          : "The local app could not complete this request. Please try again.",
      r.status,
    );
    return data;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("The local app took too long to respond. Check that its terminal is still running, then try again.");
    if (error instanceof TypeError) throw new Error("Cannot connect to the local app. Keep its terminal running and try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
