import { centreLongitude } from "./world";
import {
  Check,
  Mountain,
  Building2,
  Minus,
  Frame,
  Heart,
  Printer,
  Route,
  Waves,
  Landmark,
  Leaf,
  Layers,
  RotateCw,
  Grid2X2,
  Puzzle,
} from "lucide-react";
import { useRef, useState } from "react";
import { layout, type Settings } from "./types";
import { Field, NumberField, Toggle, Section, FeatureGroup, GridIcon } from "./Controls";
import FormatEditor, { MountEditor, TilePicker } from "./FormatEditor";
import TrailEditor from "./TrailEditor";
import { collection } from "./formats";
import MarkerEditor from "./MarkerEditor";
import TerrainStyles from "./TerrainStyles";
import StyleLibrary from "./StyleLibrary";
import { LandscapeDetails, PrintColours } from "./LandscapeDetails";

const styles: {
  name: string;
  description: string;
  icon: typeof Mountain;
  values: Partial<Settings>;
}[] = [
  {
    name: "Natural",
    description: "Gentle relief, true to the landscape",
    icon: Mountain,
    values: {
      building_style: "realistic",
      exaggeration: 3,
      building_exaggeration: 1.5,
      building_min_height: 1.2,
      roads: "raised",
      road_width: 1.2,
      road_height: 0.6,
      terrain_style: "smooth",
      smoothing: 0.8,
      buildings: true,
      water: true,
      small_buildings: "enhance",
      landmarks: false,
      forests: false,
      fields: false,
    },
  },
  {
    name: "Bold city",
    description: "Mapped buildings and defined streets",
    icon: Building2,
    values: {
      building_style: "realistic",
      exaggeration: 1,
      building_exaggeration: 3,
      building_min_height: 2,
      roads: "engraved",
      road_width: 1.8,
      road_height: 1,
      terrain_style: "smooth",
      smoothing: 0.5,
      buildings: true,
      water: true,
      small_buildings: "enhance",
      landmarks: false,
      forests: false,
      fields: false,
    },
  },
  {
    name: "Minimal",
    description: "Simple shapes, a quieter finish",
    icon: Minus,
    values: {
      building_style: "uniform",
      exaggeration: 0.5,
      building_exaggeration: 1,
      building_min_height: 0.8,
      roads: "engraved",
      road_width: 0.8,
      road_height: 0.4,
      terrain_style: "smooth",
      smoothing: 1.2,
      buildings: true,
      water: true,
      small_buildings: "enhance",
      landmarks: false,
      forests: false,
      fields: false,
    },
  },
  {
    name: "Landscape",
    description: "Hills, rivers and open countryside",
    icon: Leaf,
    values: { terrain_style: "smooth", exaggeration: 5, smoothing: 1, roads: "none", buildings: false, landmarks: false, water: true, forests: false, fields: false },
  },
  {
    name: "Contour art",
    description: "Visible layers with delicate map detail",
    icon: Layers,
    values: { terrain_style: "terraced", contour_height: 0.8, exaggeration: 4, smoothing: 0.8, roads: "engraved", road_width: 1, road_height: 0.4, buildings: false, landmarks: false, water: true, forests: false, fields: false },
  },
];
const tilePresets = [
  [1, 1],
  [2, 1],
  [2, 2],
  [3, 2],
  [3, 3],
  [4, 3],
  [4, 4],
  [5, 4],
  [5, 5],
  [6, 4],
  [6, 6],
  [8, 6],
  [8, 8],
  [10, 10],
];
const printers = [
  { name: "Bambu Lab A1 mini", width: 180, depth: 180, height: 180 },
  { name: "Bambu Lab P1S", width: 256, depth: 256, height: 256 },
  { name: "Creality Ender-3 V3 SE", width: 220, depth: 220, height: 250 },
  { name: "Creality K1 Max", width: 300, depth: 300, height: 300 },
  { name: "Original Prusa MK4S", width: 250, depth: 210, height: 220 },
];
const frameProfiles: { name: string; values: Partial<Settings> }[] = [
  { name: "Soft gallery", values: { frame_width: 10, frame_depth: 5, frame_height: 12, corner_radius: 2, inner_bevel: 1, outer_bevel: 0.8 } },
  { name: "Slim", values: { frame_width: 6, frame_depth: 4, frame_height: 5, corner_radius: 1, inner_bevel: 0.5, outer_bevel: 0.5 } },
  { name: "Deep", values: { frame_width: 16, frame_depth: 6, frame_height: 24, corner_radius: 4, inner_bevel: 2, outer_bevel: 1.5 } },
  { name: "Square", values: { frame_width: 10, frame_depth: 5, frame_height: 12, corner_radius: 0, inner_bevel: 0, outer_bevel: 0 } },
];
export default function SettingsPanel({
  section,
  settings: s,
  onChange,
  fits,
  placing,
  onPlace,
}: {
  section: "format" | "location" | "details" | "frame" | "make" | "style";
  settings: Settings;
  onChange: (values: Partial<Settings>) => void;
  fits: boolean;
  placing: string | null;
  onPlace: (id: string | null) => void;
}) {
  const lastRoad = useRef<"raised" | "engraved">(s.roads === "none" ? "raised" : s.roads);
  const lastFrame = useRef<"integrated" | "separate">(s.frame_mode === "none" ? "separate" : s.frame_mode);
  if (s.roads !== "none") lastRoad.current = s.roads;
  if (s.frame_mode !== "none") lastFrame.current = s.frame_mode;
  const [lockedRatio, setLockedRatio] = useState<number | null>(null);
  const [customPrinter, setCustomPrinter] = useState(false);
  const printerDetails = useRef<HTMLDetailsElement>(null);
  const matchingPrinter = printers.find(printer => s.printer_width === printer.width && s.printer_height === printer.depth && s.printer_z === printer.height);
  const usingCustomPrinter = customPrinter || !matchingPrinter;
  const grid = layout(s);
  const tileWidth = s.width / grid.columns, tileHeight = s.height / grid.rows;
  const usableWidth = s.printer_width - 2 * s.margin, usableDepth = s.printer_height - 2 * s.margin;
  const frameMinimum = s.frame_mode === "separate" && s.joints ? 6 : 4;
  const frameMaximum = Math.max(4, Math.min(40, Math.floor(Math.min(s.width, s.height) - 20.1) / 2));
  const frameTotalHeight = s.frame_depth + s.frame_height;
  const frameInvalid = s.frame_mode !== "none" && (2 * s.frame_width >= Math.min(s.width, s.height) - 20 || s.frame_width < frameMinimum || s.corner_radius > s.frame_width || s.inner_bevel + s.outer_bevel >= s.frame_width || Math.max(s.inner_bevel, s.outer_bevel) >= frameTotalHeight);
  function change(values: Partial<Settings>) {
    values = { ...values };
    if (values.printer_width !== undefined || values.printer_height !== undefined || values.printer_z !== undefined) setCustomPrinter(true);
    if ((values.frame_mode ?? s.frame_mode) === "separate" && (values.joints ?? s.joints) && (values.frame_width ?? s.frame_width) < 6)
      values.frame_width = 6;
    if (lockedRatio && (values.width !== undefined || values.height !== undefined)) {
      if (values.width !== undefined) {
        const width = Math.min(2000, Math.max(60, 60 * lockedRatio, Math.min(values.width, 2000 * lockedRatio)));
        values = { ...values, width, height: Math.max(60, Math.min(2000, Math.round(width / lockedRatio))) };
      } else if (values.height !== undefined) {
        const height = Math.min(2000, Math.max(60, 60 / lockedRatio, Math.min(values.height, 2000 / lockedRatio)));
        values = { ...values, height, width: Math.max(60, Math.min(2000, Math.round(height * lockedRatio))) };
      }
    }
    if (values.frame_width !== undefined) {
      const width = values.frame_width;
      values.corner_radius = Math.min(values.corner_radius ?? s.corner_radius, width);
      const inner = values.inner_bevel ?? s.inner_bevel, outer = values.outer_bevel ?? s.outer_bevel;
      if (inner + outer >= width) {
        const scale = (width - 0.1) / (inner + outer);
        values.inner_bevel = Math.floor(inner * scale * 10) / 10;
        values.outer_bevel = Math.floor(outer * scale * 10) / 10;
      }
    }
    if (values.frame_depth !== undefined || values.frame_height !== undefined) {
      const height = (values.frame_depth ?? s.frame_depth) + (values.frame_height ?? s.frame_height);
      values.inner_bevel = Math.min(values.inner_bevel ?? s.inner_bevel, Math.floor((height - 0.1) * 10) / 10);
      values.outer_bevel = Math.min(values.outer_bevel ?? s.outer_bevel, Math.floor((height - 0.1) * 10) / 10);
    }
    onChange(values);
  }
  function number(
    key: keyof Settings,
    label: string,
    min: number,
    max: number,
    step = 1,
    hint?: string,
  ) {
    return (
      <NumberField
        label={label}
        value={Number(s[key])}
        min={min}
        max={max}
        step={step}
        hint={hint}
        integer={key === "columns" || key === "rows" || key === "resolution"}
        onChange={(value) => change({ [key]: value })}
      />
    );
  }
  function toggle(key: keyof Settings, label: string) {
    return (
      <Toggle
        label={label}
        checked={Boolean(s[key])}
        onChange={(value) => change({ [key]: value })}
      />
    );
  }
  function select(
    key: keyof Settings,
    label: string,
    options: [string, string][],
  ) {
    return (
      <Field label={label}>
        <select
          aria-label={label}
          value={String(s[key])}
          onChange={(e) => change({ [key]: e.target.value })}
        >
          {options.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  const activeStyle = styles.find(({ values }) => Object.entries(values).every(([key, value]) => s[key as keyof Settings] === value));
  const border = s.frame_mode === "none" ? 0 : 2 * s.frame_width;
  const mapSize = `${(s.width - border).toFixed(1)} × ${(s.height - border).toFixed(1)} mm`;
  if (section === "location") return null;
  if (section === "frame" && s.map_format!=="artwork") return (<FeatureGroup heading="Frame & caption" icon={<Frame size={18}/>} checked={s.frame_mode !== "none"} onChange={enabled => onChange({ frame_mode: enabled ? "separate" : "none", front_caption: false })} description={collection(s) ? "Removable inserts & supporting surround" : "Puzzle tray & surround"}>
    <MountEditor settings={s} onChange={onChange}/>
    <div className="control-block">
      {select("frame_mode","Frame",[["separate",s.map_format==='hexagons'?"Matching hexagon holders":"Supporting tray & surround"],["none","No frame / holders"]])}
      {s.frame_mode!=='none'&&<>
        {s.map_format!=='hexagons'&&number("frame_width","Surround width · mm",4,40,.5)}
        {number("frame_depth","Holder base depth · mm",3,20,.5)}
        {number("frame_height","Holder rim height · mm",1,12,.5)}
        {number("tolerance","Insert edge clearance · mm",.05,.5,.05)}
      </>}
      <p className="hint" role="status">Overall size: {s.width.toFixed(1)} × {s.height.toFixed(1)} mm. Holders have flat supported bases. Test the fit before printing the full set.</p>
    </div>
  </FeatureGroup>);
  if (section === "frame") return (<>
      {s.map_format!=="artwork"&&<MountEditor settings={s} onChange={onChange}/>}
      <FeatureGroup heading="Frame & caption" icon={<Frame size={18} />} checked={s.frame_mode !== "none"} onChange={enabled => onChange({ frame_mode: enabled ? lastFrame.current : "none", ...(enabled ? {} : { front_caption: false }) })} description={`${s.frame_mode === "separate" ? "Separate" : "Built-in"} · ${s.frame_width} mm border${s.front_caption ? " · Caption on" : ""}`}>
      <p className="hint" role="status">Finished artwork: {s.width} × {s.height} mm, including the frame. Map area: {mapSize}.</p>

        {select("frame_mode", "Frame", [
          ...(s.map_format === "artwork" ? [["integrated", "Built into the map tiles"] as [string,string]] : []),
          ["separate", s.map_format === "artwork" ? "Print as separate pieces" : "Matching holders / tray"],
          ["none", "No frame"],
        ])}
        {s.frame_mode !== "none" && (
          <>
            {select("frame_contour", "Frame contour", [
              ["flat", "Flat"],
              ["minimum", "Follow land · minimum height"],
              ["follow", "Follow land · all edges"],
            ])}
            <svg viewBox="0 0 300 75" role="img" aria-label="Flat and contoured frame profiles" style={{ width: "100%", maxHeight: 95 }}>
              {(["flat", "minimum", "follow"] as const).map((mode, i) => <g key={mode} transform={`translate(${i * 100},0)`}>
                <path d="M5 58 L20 50 L40 54 L65 24 L90 40 L90 65 L5 65Z" fill="currentColor" opacity=".15" />
                <path d={mode === "flat" ? "M5 32H90" : mode === "minimum" ? "M5 32H53L65 18L90 34" : "M5 52L20 44L40 48L65 18L90 34"}
                  fill="none" stroke="currentColor" strokeWidth={s.frame_contour === mode ? 4 : 2} />
                <text x="48" y="74" textAnchor="middle" fontSize="9" fill="currentColor">{mode === "flat" ? "Flat" : mode === "minimum" ? "Minimum height" : "All edges"}</text>
              </g>)}
            </svg>
            {s.frame_contour !== "flat" && <>
              {number("frame_clearance", "Height above land · mm", 0.2, 5, 0.1)}
              <p className="hint">{s.frame_contour === "minimum" ? "The selected base depth plus frame rise is the minimum height. Higher land lifts the border." : "Every edge follows the land. Base depth sets the minimum solid thickness; frame rise does not apply."} Clearance is measured at the inner edge; bevels add to the top height. The underside stays flat.</p>
            </>}
            <div className="frame-presets" role="group" aria-label="Frame profiles">
              {frameProfiles.map(({ name, values }) => <button type="button" key={name}
                disabled={Number(values.frame_width) > frameMaximum}
                title={Number(values.frame_width) > frameMaximum ? "Choose a larger artwork to use this frame profile." : `${values.frame_width} mm border · ${Number(values.frame_depth) + Number(values.frame_height)} mm total height`}
                aria-pressed={Object.entries(values).every(([key, value]) => s[key as keyof Settings] === value)}
                onClick={() => change(values)}>{name}</button>)}
            </div>
            <p className="hint">{s.frame_mode === "separate" ? "Separate frames have a 2 mm retaining lip underneath. Its 45° seat matches the insert’s underside chamfer, keeping the printed edge supported. Leave the final frame section loose to slide the insert in, or lower it into a one-piece frame." : "The border forms part of the outer map tiles."} {s.frame_contour === "flat" ? `Total frame height: ${frameTotalHeight.toFixed(1)} mm.` : s.frame_contour === "minimum" ? `Minimum frame height: ${frameTotalHeight.toFixed(1)} mm.` : "Frame height is calculated from the land when generated."}</p>
            {s.frame_mode === "separate" && <div className="frame-fit-summary"><Frame size={18} aria-hidden="true" /><span><strong>Supported slide-in insert</strong><small>2 mm lip · 45° seat · {s.tolerance.toFixed(2)} mm side clearance</small></span></div>}
            {toggle("front_caption", "Name & coordinates on frame")}
            {s.front_caption && <p className="caption-preview"><strong>{s.name || "Your artwork name"}</strong><small>{Math.abs((s.bounds.north + s.bounds.south) / 2).toFixed(4)}° {(s.bounds.north + s.bounds.south) / 2 >= 0 ? "N" : "S"} · {Math.abs(centreLongitude(s.bounds)).toFixed(4)}° {centreLongitude(s.bounds) >= 0 ? "E" : "W"}</small><span>Printed on the bottom border</span></p>}
            <details className="advanced">
              <summary>Frame dimensions & profile</summary>
              <div className="two-col">
                {number("frame_width", "Border width · mm", frameMinimum, frameMaximum, 0.5, s.frame_mode === "separate" && s.joints ? "At least 6 mm leaves room for the joining keys." : undefined)}
                {s.frame_contour !== "follow" && number("frame_height", "Frame rise · mm", 1, 60, 0.5)}
                {number("frame_depth", "Base depth · mm", 3, 20, 0.5)}
                {number("corner_radius", "Corner radius · mm", 0, Math.floor(Math.min(15, s.frame_width) * 2) / 2, 0.5)}
                {number("inner_bevel", "Inner bevel · mm", 0, Math.max(0, Math.floor(Math.min(4, s.frame_width - s.outer_bevel - 0.1, frameTotalHeight - 0.1) * 10) / 10), 0.1)}
                {number("outer_bevel", "Outer bevel · mm", 0, Math.max(0, Math.floor(Math.min(4, s.frame_width - s.inner_bevel - 0.1, frameTotalHeight - 0.1) * 10) / 10), 0.1)}
                {s.frame_mode === "separate" && number("tolerance", "Insert clearance · mm", 0.05, 0.5, 0.05, "Side clearance between the insert and frame wall. Print the fit-test pieces first.")}
              </div>
              <p className="hint">
                Total frame height is base depth plus rise. Set corners and
                bevels to zero for a flat, square profile.
              </p>
            </details>
          </>
        )}
        {frameInvalid && <div className="settings-feedback" role="status"><p>{s.frame_width < frameMinimum ? "A separate frame with joining keys needs a border at least 6 mm wide." : s.frame_width > frameMaximum ? "Reduce the border width to leave room for your map." : "The corners and bevels need to fit inside the frame profile."}</p><button type="button" onClick={() => change({
          frame_width: Math.max(frameMinimum, Math.min(s.frame_width, frameMaximum)),
          corner_radius: Math.min(s.corner_radius, s.frame_width, frameMaximum),
          inner_bevel: Math.min(s.inner_bevel, frameTotalHeight - 0.1),
          outer_bevel: Math.min(s.outer_bevel, frameTotalHeight - 0.1),
        })}>Fit profile to border</button></div>}
      </FeatureGroup>
  </>);
  if (section === "format" || section === "make")
    return (
      <>
        {section === "format" && <FormatEditor settings={s} onChange={onChange}/>}
        {section === "format" && !collection(s) && <div className="control-block">
          <p className="hint">Choose the finished size, including your frame. The map selection updates with the proportions.</p>
          <h3>Finished artwork size</h3>
          <div className="size-presets" role="group" aria-label="Artwork sizes">
            {[
              [200, 200, "Small"],
              [400, 300, "Medium"],
              [600, 400, "Large"],
            ].map(([width, height, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={s.width === width && s.height === height}
                onClick={() => {
                  if (lockedRatio) setLockedRatio(Number(width) / Number(height));
                  onChange({ width: Number(width), height: Number(height) });
                }}
              >
                <span
                  className="size-shape"
                  style={{ aspectRatio: `${width} / ${height}` }}
                />
                <strong>{label}</strong>
                <small>
                  {width} × {height}
                </small>
              </button>
            ))}
          </div>
          <div className="two-col">
            {number("width", "Width · mm", 60, 2000)}
            {number("height", "Height · mm", 60, 2000)}
          </div>
          <div className="dimension-tools">
            <Toggle label="Keep proportions" checked={lockedRatio !== null}
              onChange={(checked) => setLockedRatio(checked ? s.width / s.height : null)} />
            <button type="button" onClick={() => {
              onChange({ width: s.height, height: s.width });
              if (lockedRatio) setLockedRatio(1 / lockedRatio);
            }}><RotateCw size={14} />Rotate size</button>
          </div>
          <p className="hint">Outer dimensions, including the frame. {lockedRatio ? "Changing one dimension also changes the other." : "Set any size from 60 to 2,000 mm."}</p>
          <p className="hint">Map area: {mapSize} with your current frame.</p>
        </div>}
        {section === "make" && <>
        <Section open heading="Your printer" icon={<Printer size={18} />} description={`${s.printer_width} × ${s.printer_height} mm plate · ${s.nozzle} mm nozzle`}>
          <div className="printer-summary">
            <Printer size={23} />
            <span>
              <strong>
                {s.printer_width} × {s.printer_height} mm build plate
              </strong>
              <small>
                {s.printer_z} mm height · {s.nozzle} mm nozzle
              </small>
            </span>
          </div>
          <div className="printer-presets" role="group" aria-label="Printer build volume presets">
              {printers.map((printer) => <button type="button" key={printer.name}
                aria-pressed={!usingCustomPrinter && matchingPrinter === printer}
                onClick={() => {
                  setCustomPrinter(false);
                  onChange({ printer_width: printer.width, printer_height: printer.depth, printer_z: printer.height });
                }}>
                <strong>{printer.name}</strong><small>{printer.width} × {printer.depth} × {printer.height} mm</small>
              </button>)}
              <button type="button" aria-pressed={usingCustomPrinter} onClick={() => {
                setCustomPrinter(true);
                if (printerDetails.current) printerDetails.current.open = true;
              }}><strong>Custom build plate</strong><small>Enter your own dimensions</small></button>
            </div>
            <p className="hint">Choose a matching printer or enter a custom build volume. Sizes are width × depth × height; plate margins are kept.</p>
          <details ref={printerDetails} className="advanced" open={usingCustomPrinter}>
            <summary>Change printer settings</summary>
            <div className="two-col">
              {number("printer_width", "Build width · mm", 80, 1000)}
              {number("printer_height", "Build depth · mm", 80, 1000)}
              {number("printer_z", "Build height · mm", 20, 1000)}
              {number("margin", "Plate margin · mm", 0, 30)}
              {number("nozzle", "Nozzle diameter · mm", 0.2, 1, 0.1)}
            </div>
            <p className="hint">Usable plate: {usableWidth} × {usableDepth} mm after margins. Build height is checked against your generated parts.</p>
          </details>
        </Section>
        {(s.map_format==="artwork"||s.frame_mode!=="none")&&<Section
          heading={s.map_format==="artwork"?"Tile layout":"Holder plate layout"}
          icon={<Grid2X2 size={18} />}
          description={`${grid.columns * grid.rows} ${grid.columns * grid.rows === 1 ? "tile" : "tiles"} · ${s.layout === "auto" ? "Automatic" : "Custom"} · ${fits ? "Fits your printer" : "Needs attention"}`}
          open={!fits}
        >
          <div className="segmented" role="group" aria-label="Tile layout mode">
            <button
              type="button"
              aria-pressed={s.layout === "auto"}
              onClick={() => onChange({ layout: "auto" })}
            >
              Automatic
            </button>
            <button
              type="button"
              aria-pressed={s.layout === "manual"}
              onClick={() =>
                onChange({
                  layout: "manual",
                  columns: grid.columns,
                  rows: grid.rows,
                })
              }
            >
              Custom
            </button>
          </div>
          <div
            className={`tile-summary ${fits ? "" : "invalid"}`}
            role="status"
          >
            <GridIcon columns={grid.columns} rows={grid.rows} />
            <span>
              <strong>
                {grid.columns} columns × {grid.rows} rows
              </strong>
              <small>
                {`${grid.columns * grid.rows} ${grid.columns * grid.rows === 1 ? "tile" : "tiles"} · ${tileWidth.toFixed(1)} × ${tileHeight.toFixed(1)} mm each`}
              </small>
            </span>
            {fits && <Check size={17} />}
          </div>
          {!fits && <div className="settings-feedback" role="status">
            <p>{grid.columns * grid.rows > 100 ? "Use 100 tiles or fewer. Reduce the artwork size or increase your usable build plate." : tileWidth > usableWidth || tileHeight > usableDepth ? "These tiles exceed your usable build plate. Add columns or rows, or choose Automatic." : "Tiles need at least 30 mm on each side, with 24 mm of map beside a frame. Reduce the tile count or frame width."}</p>
            {s.layout === "manual" && <button type="button" onClick={() => onChange({ layout: "auto" })}>Find an automatic layout</button>}
          </div>}
          {s.layout === "auto" ? (
            <p className="hint">
              The fewest tiles that fit your build plate, with room around the
              edges.
            </p>
          ) : (
            <>
              <div className="two-col custom-layout">
                {number("columns", "Columns", 1, 20)}
                {number("rows", "Rows", 1, 20)}
              </div>
              <details className="advanced">
                <summary>Choose a tile preset</summary>
                <div className="tile-presets">
                  {tilePresets.map(([columns, rows]) => {
                    const tileWidth = s.width / columns,
                      tileHeight = s.height / rows,
                      fw = s.frame_mode === "none" ? 0 : s.frame_width;
                    const available =
                      tileWidth <= s.printer_width - 2 * s.margin &&
                      tileHeight <= s.printer_height - 2 * s.margin &&
                      Math.min(tileWidth, tileHeight) >=
                        Math.max(30, fw ? fw + 24 : 30);
                    return (
                      <button
                        key={`${columns}x${rows}`}
                        type="button"
                        disabled={!available}
                        aria-pressed={
                          columns === grid.columns && rows === grid.rows
                        }
                        title={
                          available
                            ? `${columns * rows} tiles`
                            : "This layout does not fit the current artwork and printer."
                        }
                        onClick={() =>
                          onChange({ layout: "manual", columns, rows })
                        }
                      >
                        <strong>
                          {columns} × {rows}
                        </strong>
                        <small>{columns * rows} tiles</small>
                      </button>
                    );
                  })}
                </div>
              </details>
            </>
          )}
        </Section>}
        {s.map_format==="artwork"&&<Section heading="Joining & print details" icon={<Puzzle size={18} />} description={`${s.joints ? "Joining keys" : "No keys"} · ${s.labels ? "Back labels" : "No back labels"}`}>
          {toggle("joints", "Hidden joining keys")}
          {toggle("labels", "Labels on the back")}
          {s.joints &&
            number("tolerance", "Key clearance · mm", 0.05, 0.5, 0.05)}
          {number("seam", "Seam allowance · mm", 0, 0.4, 0.05)}
          <p className="hint">
            Joining keys fit into rear pockets. Print the included fit-test
            pieces first. Zero seam allowance keeps the full map.
          </p>
          {s.nozzle > 0.4 && s.labels && <p className="settings-feedback">A {s.nozzle} mm nozzle may lose fine lettering. Check the back labels in your slicer or turn them off.</p>}
        </Section>}
        </>}
      </>
    );
  const stylePicker = <>
      <div className="control-block">
        <h3>Start with a style</h3>
        <div className="style-presets simple-style-presets" role="group" aria-label="Model styles">
          {styles.slice(0, 3).map(({ name, description, icon: Icon, values }) => {
            const active =
              Object.entries(values).every(
                ([key, value]) => s[key as keyof Settings] === value,
              );
            return (
              <button
                key={name}
                type="button"
                aria-pressed={active}
                title={description}
                onClick={() => onChange(values)}
              >
                <span className="style-icon">
                  <Icon size={25} strokeWidth={1.5} />
                </span>
                <span>
                  <strong>{name}</strong>
                </span>
                <span className="choice-indicator">
                  {active && <Check size={12} />}
                </span>
              </button>
            );
          })}
        </div>
        <p className="hint starting-style-note" role="status">{activeStyle ? activeStyle.description : "Custom style · your changes are kept."}</p>
        <details className="advanced more-styles">
          <summary><Layers size={16} aria-hidden="true" />More styles & saved presets</summary>
          <div className="style-presets" role="group" aria-label="More model styles">
            {styles.slice(3).map(({ name, description, icon: Icon, values }) => <button key={name} type="button" aria-pressed={activeStyle?.name === name} onClick={() => onChange(values)}><Icon size={20} aria-hidden="true" /><span><strong>{name}</strong><small>{description}</small></span></button>)}
          </div>
          <StyleLibrary settings={s} onApply={change} />
        </details>
        <p className="hint customise-hint">Open a group to customise it.</p>
      </div>
  </>;
  if (section === "style") return stylePicker;
  return (<>
      <TerrainStyles settings={s} onChange={onChange} />
      <div className="feature-list" aria-label="Map features">
        <FeatureGroup heading="Roads" icon={<Route size={18}/>} checked={s.roads !== "none"} onChange={enabled => onChange({ roads: enabled ? lastRoad.current : "none" })} description={`${s.roads === "engraved" ? "Engraved" : "Raised"} · ${s.road_width} mm wide`}>
        {select("roads", "Road treatment", [
          ["raised", "Raised"],
          ["engraved", "Engraved"],
          ["none", "Hidden"],
        ])}
        {s.roads !== "none" && (
          <div className="feature-settings">
            <div className="two-col">
              {number("road_width", "Road width · mm", 0.6, 5, 0.1)}
              {number("road_height", s.roads === "engraved" ? "Engraving depth · mm" : "Road rise · mm", 0.2, 3, 0.1)}
            </div>
            {s.road_width < 2 * s.nozzle && <p className="settings-feedback">Roads are narrower than two nozzle widths. Try at least {(2 * s.nozzle).toFixed(1)} mm for a more reliable print.</p>}
          </div>
        )}
        </FeatureGroup>
        <FeatureGroup heading="Rivers & water" icon={<Waves size={18}/>} checked={s.water} onChange={water => onChange({ water })} description={`${s.water_style === "smooth" ? "Smooth" : "Contoured"} · ${s.water_depth} mm depth`}>
        {s.water && (
          <div className="feature-settings">
            {select("water_style", "Water surface", [["carved", "Follow land contours"], ["smooth", "Smooth flowing water"]])}
            <div className="two-col">
              {number("water_width", "Water width · mm", 0.8, 8, 0.1)}
              {number("water_depth", "Water depth · mm", 0.2, 2, 0.1)}
            </div>
            {number("water_bank", "Soft bank width · mm", 0, 3, 0.1)}
            <p className="hint">Smooth water softens the channel bed while following the landscape. Bank width controls the transition into the surrounding land; zero gives a crisp edge. Water width is the minimum visible channel width.</p>
            {s.water_width < 2 * s.nozzle && <p className="settings-feedback">Try a water width of at least {(2 * s.nozzle).toFixed(1)} mm for your nozzle.</p>}
          </div>
        )}
        </FeatureGroup>
        <FeatureGroup heading="Buildings" icon={<Building2 size={18}/>} checked={s.buildings} onChange={buildings => onChange({ buildings })} description={`${s.building_style === "realistic" ? "Mapped roofs" : s.building_style === "uniform" ? "Uniform blocks" : "Stepped roofs"} · ${s.building_exaggeration}× height`}>
        {s.buildings && (
          <div className="feature-settings">
            {select("building_source", "Building coverage", [
              ["combined", "Enhanced coverage (recommended)"],
              ["osm", "OpenStreetMap only"],
            ])}
            <p className="hint">
              Enhanced coverage uses OpenStreetMap and Overture outlines, mapped building parts and roof shapes where available. Heights may be estimated.
            </p>
            {select("building_style", "Building style", [
              ["realistic", "Real buildings & mapped roofs"],
              ["uniform", "Uniform blocks"],
              ["stepped", "Stepped rooftops"],
            ])}
            {select("small_buildings", "Small buildings", [
              ["enhance", "Enlarge for visibility"],
              ["keep", "Keep original footprints"],
              ["omit", "Omit below minimum width"],
            ])}
            <div className="two-col">
              {number("building_min_width", "Minimum width · mm", 0.4, 4, 0.1)}
              {number(
                "building_min_height",
                "Minimum relief · mm",
                0.2,
                10,
                0.1,
              )}
              {number(
                "building_height",
                s.building_style === "uniform"
                  ? "Block height · metres"
                  : "Fallback height · metres",
                2,
                80,
              )}
              {number(
                "building_exaggeration",
                "Building height multiplier",
                0.1,
                10,
                0.1,
              )}
            </div>
            <p className="hint">{s.small_buildings === "enhance" ? `Buildings use at least ${Math.max(s.building_min_width, 2 * s.nozzle).toFixed(1)} mm width when enlarged for your ${s.nozzle} mm nozzle.` : s.small_buildings === "omit" ? `Buildings below ${Math.max(s.building_min_width, 2 * s.nozzle).toFixed(1)} mm width are omitted.` : "Original footprints are kept. Very small buildings may be too fine for your nozzle."}</p>
            <p className="hint">
              Small buildings may be enlarged for printing. Source coverage
              varies by place.
            </p>
          </div>
        )}
        </FeatureGroup>
        <FeatureGroup heading="Historic sites & landmarks" icon={<Landmark size={18}/>} checked={s.landmarks} onChange={landmarks => onChange({ landmarks })} description="Mapped historic places">
        {s.landmarks && <p className="hint">Adds mapped historic sites and landmarks. Their relief follows your building height and style settings.</p>}
        </FeatureGroup>
        <LandscapeDetails settings={s} onChange={onChange} />
      </div>
      <PrintColours settings={s} onChange={onChange} />
      <Section heading="Trails" icon={<Route size={18}/>} description={`${s.trails.length} routes · import, draw or choose mapped paths`} group="style-options">
        <TrailEditor settings={s} onChange={onChange} drawing={placing?.startsWith('trail:')?placing.slice(6):null} onDraw={id=>onPlace(id?'trail:'+id:null)}/>
      </Section>
      <Section
        heading={`Special places${s.markers.length ? ` · ${s.markers.length}` : ""}`}
        icon={<Heart size={18} />}
        description={s.markers.length || s.marker ? `${s.markers.length + (s.marker ? 1 : 0)} symbols on your map` : "Add a heart, star or pin"}
        group="style-options"
      >
        <MarkerEditor
          settings={s}
          onChange={(markers) => onChange({ markers })}
          placing={placing}
          onPlace={onPlace}
        />
        {s.marker && <div className="legacy-marker-tools">
          <button type="button" disabled={s.markers.length >= 20} onClick={() => {
            const id = crypto.randomUUID();
            onChange({ marker: false, markers: [...s.markers, { id, label: "Saved location", symbol: "pin", lon: s.marker_lon, lat: s.marker_lat, size: 3.4, rise: 2 }] });
            onPlace(id);
          }}>Edit saved location marker</button>
          <button type="button" onClick={() => onChange({ marker: false })}>Remove saved location marker</button>
        </div>}
      </Section>
    </>
  );
}
