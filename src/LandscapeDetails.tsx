import { Leaf, Palette, Sprout, Trees } from "lucide-react";
import { Field, NumberField, Section, Toggle } from "./Controls";
import type { MaterialId, Settings } from "./types";
import "./landscape.css";

const materials: { id: MaterialId; name: string; hint: string }[] = [
  { id: "ground", name: "Grass & terrain", hint: "The base and open ground" },
  { id: "water", name: "Rivers & lakes", hint: "Water channels and surfaces" },
  { id: "forest", name: "Forests", hint: "Mapped woods and tree effects" },
  { id: "fields", name: "Fields", hint: "Mapped farmland and meadows" },
  { id: "roads", name: "Roads", hint: "Raised or engraved streets" },
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
  return <Section heading="Forests & fields" icon={<Leaf size={18} />} description={[s.forests && "Forests on", s.fields && "fields on"].filter(Boolean).join(" · ") || "Optional landscape textures"}>
    <p className="hint">Add texture where OpenStreetMap identifies woodland, farmland and meadows. Patterns follow the terrain.</p>
    <button type="button" className="landscape-starter" aria-pressed={starterApplied} onClick={() => onChange({ water: true, water_style: "smooth", water_bank: 0.8, forests: true, forest_style: "trees", tree_type: "mixed", forest_grouping: "groves", fields: true, field_style: "rounded" })}><Sprout size={17} aria-hidden="true" />{starterApplied ? "Landscape detail added" : "Add landscape detail"}</button>
    <div className="layer-label"><Trees size={16} /><Toggle label="Forest effects" checked={s.forests} onChange={(forests) => onChange({ forests })} /></div>
    {s.forests && <div className="natural-feature-settings">
      <Field label="Forest treatment"><select aria-label="Forest treatment" value={s.forest_style} onChange={(e) => onChange({ forest_style: e.target.value as Settings["forest_style"] })}><option value="canopy">Low canopy texture</option><option value="trees">Individual tree shapes</option></select></Field>
      <Field label="Tree grouping"><select aria-label="Tree grouping" value={s.forest_grouping} onChange={(e) => onChange({ forest_grouping: e.target.value as Settings["forest_grouping"] })}><option value="groves">Clustered groves</option><option value="even">Evenly spaced woodland</option></select></Field>
      {s.forest_style === "trees" && <Field label="Tree type"><select aria-label="Tree type" value={s.tree_type} onChange={(e) => onChange({ tree_type: e.target.value as Settings["tree_type"] })}><option value="mixed">Mixed woodland</option><option value="broadleaf">Rounded broadleaf</option><option value="conifer">Pointed conifers</option></select></Field>}
      <p className="hint">{s.forest_grouping === "groves" ? "Small groups of trees with open spaces between groves, kept inside each mapped woodland." : "A regular staggered pattern across each mapped woodland."}</p>
      <details className="advanced"><summary>Tree size & spacing</summary>
      <div className="two-col">
        {numeric(s, onChange, "tree_size", "Tree width · mm", 1.2, 6, 0.1)}
        {numeric(s, onChange, "tree_height", "Tree rise · mm", 0.4, 5, 0.1)}
      </div>
      {numeric(s, onChange, "tree_spacing", "Tree spacing · mm", 1.5, 12, 0.1)}
      <p className="hint">Tree positions are an illustrative pattern inside mapped woods. Wider spacing gives a quieter canopy and a faster print.</p>
      {s.forest_style === "canopy" && <p className="hint">Low canopy rises {(s.tree_height * 0.55).toFixed(2)} mm above the land, using 55% of your selected tree height.</p>}
      {forestSpacing > s.tree_spacing && <p className="settings-feedback">The selected crowns need {forestSpacing.toFixed(2)} mm spacing. This spacing is applied automatically to support their size.</p>}
      </details>
    </div>}
    <div className="layer-label"><Sprout size={16} /><Toggle label="Field effects" checked={s.fields} onChange={(fields) => onChange({ fields })} /></div>
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
  </Section>;
}
export function PrintColours({ settings: s, onChange }: { settings: Settings; onChange: (values: Partial<Settings>) => void }) {
  const count = new Set(materials.map(({ id }) => String(s[`colour_${id}` as keyof Settings]).toUpperCase())).size;
  const matchesPalette = (values: Partial<Settings>) => Object.entries(values).every(([key, value]) => String(s[key as keyof Settings]).toUpperCase() === String(value).toUpperCase());
  return <Section heading="Print colours" icon={<Palette size={18} />} description={s.multicolour ? `${count} palette colours · Colour 3MFs` : "Single colour · Use your chosen filament"} group="style-options">
    <Toggle label="Multicolour print package" checked={s.multicolour} onChange={(multicolour) => onChange({ multicolour })} />
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
  </Section>;
}
