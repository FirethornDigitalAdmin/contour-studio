import { Leaf, Palette, Sprout, Trees } from "lucide-react";
import { Field, NumberField, Section, Toggle, FeatureGroup } from "./Controls";
import type { MaterialId, Settings } from "./types";
import "./landscape.css";

const materials: { id: MaterialId; name: string; hint: string }[] = [
  { id: "ground", name: "Grass & terrain", hint: "The base and open ground" },
  { id: "water", name: "Rivers & lakes", hint: "Water channels and surfaces" },
  { id: "forest", name: "Forests", hint: "Woods, tree effects and smooth parks" },
  { id: "fields", name: "Fields", hint: "Mapped farmland and meadows" },
  { id: "roads", name: "Roads", hint: "Streets, tracks and urban surfaces" },
  { id: "buildings", name: "Buildings", hint: "Buildings and landmarks" },
  { id: "frame", name: "Frame", hint: "Integrated or separate border" },
  { id: "markers", name: "Special places", hint: "Your hearts, stars and pins" },
];
export const fourColourPalette: Partial<Settings> = {
  colour_ground: "#80A768", colour_forest: "#80A768", colour_fields: "#E9DECA",
  colour_water: "#397CA7", colour_roads: "#E9DECA", colour_buildings: "#E9DECA",
  colour_frame: "#2B4045", colour_markers: "#2B4045",
};
const palettes: { name: string; description: string; values: Partial<Settings> }[] = [
  { name: "Countryside · 4", description: "One AMS · green, blue, cream and charcoal", values: fourColourPalette },
  { name: "Colour atlas · 8", description: "Distinct woods, fields and personal touches", values: { ...fourColourPalette, colour_forest: "#385A39", colour_fields: "#C5AF68", colour_roads: "#D4CCBA", colour_markers: "#C46E4B" } },
  { name: "River study · 2", description: "Blue waterways against warm white land", values: Object.fromEntries(materials.map(({ id }) => [`colour_${id}`, id === "water" ? "#397CA7" : "#E9DECA"])) },
];
function numeric(s: Settings, onChange: (values: Partial<Settings>) => void, key: keyof Settings, label: string, min: number, max: number, step: number) {
  return <NumberField label={label} value={Number(s[key])} min={min} max={max} step={step} onChange={(value) => onChange({ [key]: value })} />;
}
export function LandscapeDetails({ settings: s, onChange }: { settings: Settings; onChange: (values: Partial<Settings>) => void }) {
  const starterApplied = s.water && s.water_style === "smooth" && s.water_bank === 0.8 && s.forests && s.forest_style === "trees" && s.fields && s.field_style === "rounded" && s.forest_grouping === "groves" && s.tree_type === "mixed";
  const forestSpacing = Math.max(s.tree_spacing, s.tree_size * 0.8);
  return <><Section heading="Transport & urban land" description={s.railways ? "Railways on · Printable relief" : "Optional streets, tracks and open spaces"}>
    <button type="button" className="landscape-starter" onClick={() => onChange({ railways: true, road_hierarchy: true, urban_spaces: true, supported_crossings: true, preserve_building_gaps: true, building_type_heights: true })}>Add transport & city detail</button>
    <Toggle label="Railways & platforms" checked={s.railways} onChange={(railways) => onChange({ railways })} />
    {s.railways && <>
      <Field label="Railway treatment"><select aria-label="Railway treatment" value={s.railway_style} onChange={(e) => onChange({ railway_style: e.target.value as Settings["railway_style"] })}><option value="tracks">Rails & sleepers where printable</option><option value="bed">Simple supported track beds</option></select></Field>
      <div className="two-col">{numeric(s, onChange, "railway_width", "Track bed width · mm", 0.8, 8, 0.1)}{numeric(s, onChange, "railway_height", "Track bed rise · mm", 0.2, 1.5, 0.1)}</div>
      <p className="hint">Track beds follow mapped routes and share the roads colour. Width is at least six nozzle widths. Rails and sleepers appear only when the scaled track gauge leaves printable gaps; smaller tracks use a solid bed. Parallel tracks can merge at wide-area scales.</p>
    </>}
    <Toggle label="Road hierarchy" checked={s.road_hierarchy} onChange={(road_hierarchy) => onChange({ road_hierarchy })} />
    <p className="hint">Main roads are wider than residential streets and paths. Hierarchy widths are at least two nozzle widths.</p>
    <Toggle label="Parks & urban surfaces" checked={s.urban_spaces} onChange={(urban_spaces) => onChange({ urban_spaces })} />
    <p className="hint">Mapped parks and recreation areas use smooth green relief; parking, industrial and railway land use smooth road-coloured relief. Both rise 0.2 mm, stay clear of buildings and water, and omit strips narrower than two nozzle widths.</p>
    <Toggle label="Supported crossings & hidden tunnels" checked={s.supported_crossings} onChange={(supported_crossings) => onChange({ supported_crossings })} />
    <p className="hint">Enable roads or railways to include mapped bridges. Underground routes are hidden.</p>
    {s.supported_crossings && <>
      <Toggle label="Simple bridge openings" checked={s.bridge_openings} onChange={(bridge_openings) => onChange({ bridge_openings })} />
      <p className="hint">Rounded arches use short bridging across the crown, less than 3 mm. Their position follows mapped water or crossing routes, otherwise the bridge midpoint. Decks may be raised to fit; tiny crossings stay solid. These are simplified openings, not measured arches. Turn off for fully filled crossings.</p>
    </>}
    <Toggle label="Preserve gaps between buildings" checked={s.preserve_building_gaps} onChange={(preserve_building_gaps) => onChange({ preserve_building_gaps })} />
    <p className="hint">Avoid widening small buildings into neighbours. Where widening cannot fit, keep printable mapped outlines and omit those narrower than two nozzle widths. A closer selection recovers more detail.</p>
    <Toggle label="Estimate missing heights by building type" checked={s.building_type_heights} onChange={(building_type_heights) => onChange({ building_type_heights })} />
    <p className="hint">Mapped heights and levels take priority. Missing heights vary by mapped building type relative to your fallback height; these are estimates. Uniform building style keeps a single height.</p>
    <p className="hint">Update the model to generate these details. Existing saved models keep their geometry until regenerated.</p>
  </Section><div className="landscape-feature-groups">

    <button type="button" className="landscape-starter" aria-pressed={starterApplied} onClick={() => onChange({ water: true, water_style: "smooth", water_bank: 0.8, forests: true, forest_style: "trees", tree_type: "mixed", forest_grouping: "groves", fields: true, field_style: "rounded" })}><Sprout size={17} aria-hidden="true" />{starterApplied ? "Landscape detail added" : "Add landscape detail"}</button>
    <FeatureGroup heading="Trees & woodland" icon={<Trees size={18}/>} checked={s.forests} onChange={forests => onChange({ forests })} description={`${s.forest_style === "trees" ? "Tree shapes" : "Low canopy"} · ${s.forest_grouping === "groves" ? "Grouped" : "Evenly spaced"}`}>
    {s.forests && <div className="natural-feature-settings">
      <p className="hint">Real mapped trees, tree rows and groups are included, plus Forest Research canopy outlines where available in England. Rows and canopy patches have rounded foliage crowns within real source cover, without invented trunk positions. Tiny details may be omitted at print scale.</p>
      <Field label="Woodland treatment"><select aria-label="Woodland treatment" value={s.forest_style} onChange={(e) => onChange({ forest_style: e.target.value as Settings["forest_style"] })}><option value="canopy">Low canopy texture</option><option value="trees">Individual tree shapes</option></select></Field>
      <Field label="Tree grouping"><select aria-label="Tree grouping" value={s.forest_grouping} onChange={(e) => onChange({ forest_grouping: e.target.value as Settings["forest_grouping"] })}><option value="groves">Clustered groves</option><option value="even">Evenly spaced woodland</option></select></Field>
      {s.forest_style === "trees" && <Field label="Tree type"><select aria-label="Tree type" value={s.tree_type} onChange={(e) => onChange({ tree_type: e.target.value as Settings["tree_type"] })}><option value="mixed">Mixed woodland</option><option value="broadleaf">Rounded broadleaf</option><option value="conifer">Pointed conifers</option></select></Field>}
      <p className="hint">{s.forest_grouping === "groves" ? "Illustrative groups kept inside mapped woodland; these shapes do not locate individual trunks." : "Illustrative staggered shapes across mapped woodland; these do not locate individual trunks."}</p>
      <details className="advanced"><summary>Tree size & spacing</summary>
      <div className="two-col">
        {numeric(s, onChange, "tree_size", "Tree width · mm", 1.2, 6, 0.1)}
        {numeric(s, onChange, "tree_height", "Tree rise · mm", 0.4, 5, 0.1)}
      </div>
      {numeric(s, onChange, "tree_spacing", "Tree spacing · mm", 1.5, 12, 0.1)}
      <p className="hint">Spacing applies to illustrative woodland texture only. Mapped tree points, rows and canopy outlines keep their source locations.</p>
      {s.forest_style === "canopy" && <p className="hint">Low canopy rises {(s.tree_height * 0.55).toFixed(2)} mm above the land, using 55% of your selected tree height.</p>}
      {forestSpacing > s.tree_spacing && <p className="settings-feedback">The selected crowns need {forestSpacing.toFixed(2)} mm spacing. This spacing is applied automatically to support their size.</p>}
      </details>
    </div>}
    </FeatureGroup>
    <FeatureGroup heading="Field effects" icon={<Sprout size={18}/>} checked={s.fields} onChange={fields => onChange({ fields })} description={s.field_style === "rounded" ? "Rounded crop lines" : s.field_style === "furrows" ? "Square ridges" : "Smooth fields"}>
    {s.fields && <div className="natural-feature-settings">
      <Field label="Field treatment"><select aria-label="Field treatment" value={s.field_style} onChange={(e) => onChange({ field_style: e.target.value as Settings["field_style"] })}><option value="rounded">Rounded crop lines</option><option value="furrows">Square crop ridges</option><option value="flat">Smooth · no raised texture</option></select></Field>
      {s.field_style !== "flat" && <details className="advanced"><summary>Crop row size & direction</summary>
        <div className="two-col">
          {numeric(s, onChange, "field_spacing", "Crop row spacing · mm", 1, 8, 0.1)}
          {numeric(s, onChange, "field_height", "Crop row rise · mm", 0.2, 1.5, 0.05)}
        </div>
        {numeric(s, onChange, "field_angle", "Crop row direction · degrees", 0, 180, 5)}
      </details>}
      {s.field_style === "flat" && <p className="hint">Smooth fields keep the land contours with no raised rows. Multicolour printing can distinguish mapped fields with your chosen colour.</p>}
      <p className="hint">Textures stay inside mapped field boundaries and clear your roads, rivers, buildings and special places. Coverage varies by area.</p>
    </div>}
    </FeatureGroup>
  </div></>;
}
export function PrintColours({ settings: s, onChange }: { settings: Settings; onChange: (values: Partial<Settings>) => void }) {
  const count = new Set(materials.map(({ id }) => String(s[`colour_${id}` as keyof Settings]).toUpperCase())).size;
  const matchesPalette = (values: Partial<Settings>) => Object.entries(values).every(([key, value]) => String(s[key as keyof Settings]).toUpperCase() === String(value).toUpperCase());
  return <FeatureGroup heading="Print colours" icon={<Palette size={18}/>} checked={s.multicolour} onChange={multicolour => onChange({ multicolour })} description={`${count} palette colours · Colour 3MFs`}>
    <p className="hint">Generate a colour 3MF for each tile, with separate parts to assign to your AMS filaments in Bambu Studio.</p>
    {s.multicolour && <>
      <div className="print-palette-presets" role="group" aria-label="Print colour palettes">
        {palettes.map(({ name, description, values }) => <button type="button" key={name} aria-pressed={matchesPalette(values)} onClick={() => onChange(values)}><strong>{name}</strong><small>{description}</small><span aria-hidden="true">{[...new Set(Object.values(values))].map((colour) => <i key={String(colour)} style={{ background: String(colour) }} />)}</span></button>)}
      </div>
      <div className="print-palette-count" role="status"><strong>{count} palette colours</strong><span>Matching colours share one filament. The package only includes materials present in each tile.</span></div>
      {count > 4 && <p className="settings-feedback">This palette uses more than four colours. Use additional AMS capacity, assign some parts to the same filament, or choose Countryside · 4.</p>}
      <details className="advanced"><summary>Customise individual colours</summary>
      <div className="print-colour-grid">
        {materials.map(({ id, name, hint }) => <label key={id} className="print-colour-field"><input type="color" aria-label={`${name} print colour`} value={String(s[`colour_${id}` as keyof Settings])} onChange={(e) => onChange({ [`colour_${id}`]: e.target.value.toUpperCase() })} /><span><strong>{name}</strong><small>{hint}</small></span><code>{String(s[`colour_${id}` as keyof Settings]).toUpperCase()}</code></label>)}
      </div>
      </details>
      <details className="advanced"><summary>Colour layer depth</summary>
        {numeric(s, onChange, "colour_depth", "Colour depth · mm", 0.4, 2, 0.1)}
        <p className="hint">Colour stays near the terrain surface; the supporting core uses the ground colour. At 0.2 mm layer height, {s.colour_depth.toFixed(1)} mm is about {Math.round(s.colour_depth / 0.2)} layers minimum. Slopes, recesses and raised details need extra colour depth. A tile may use a deeper core if its surface boundaries fail export checks; the package reports this.</p>
      </details>
      <p className="hint">Colours indicate your chosen filament shades. Set the printer, material profiles and loaded AMS slots in your slicer. Update the model to refresh the exported files.</p>
    </>}
  </FeatureGroup>;
}
