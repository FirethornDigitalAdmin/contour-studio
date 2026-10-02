import { useState } from "react";
import { BookmarkPlus, Check, Trash2 } from "lucide-react";
import { Section } from "./Controls";
import type { Settings } from "./types";
import { validSettingValue } from "./validation";

const keys = ["exaggeration", "smoothing", "terrain_style", "contour_height", "facet_size", "resolution", "base", "frame_mode", "frame_width", "frame_depth", "frame_height", "corner_radius", "inner_bevel", "outer_bevel", "roads", "road_width", "road_height", "water", "water_width", "water_depth", "water_style", "water_bank", "forests", "forest_style", "tree_size", "tree_height", "tree_spacing", "fields", "field_style", "field_spacing", "field_height", "field_angle", "multicolour", "colour_depth", "colour_ground", "colour_water", "colour_forest", "colour_fields", "colour_roads", "colour_buildings", "colour_frame", "colour_markers", "buildings", "building_source", "building_height", "building_exaggeration", "small_buildings", "building_min_width", "building_min_height", "building_style", "landmarks", "front_caption"] as const;
type Style = { id: string; name: string; values: Partial<Settings> };
const storageKey = "contour-studio.styles.v1";
function readStyles(): Style[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "[]");
    const seen = new Set<string>();
    return Array.isArray(value) ? value.filter((s) => {
      if (typeof s?.id !== "string" || !s.id.trim() || s.id.length > 64 || seen.has(s.id) || typeof s.name !== "string" || !s.name.trim() || s.name.length > 40 || !s.values || typeof s.values !== "object" || Array.isArray(s.values)) return false;
      seen.add(s.id);
      return true;
    }).slice(-20) : [];
  } catch { return []; }
}
export default function StyleLibrary({ settings, onApply }: { settings: Settings; onApply: (values: Partial<Settings>) => void }) {
  const [styles, setStyles] = useState(readStyles);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const matchingName = styles.find((style) => style.name.trim().toLowerCase() === name.trim().toLowerCase());
  const availableStyles = styles.flatMap((style) => {
    const values = Object.fromEntries(keys.filter((key) => key in style.values && validSettingValue(key, style.values[key], settings)).map((key) => [key, style.values[key]])) as Partial<Settings>;
    return Object.keys(values).length ? [{ ...style, values }] : [];
  });
  function save(next: Style[]) {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setStyles(next); return true; }
    catch { setMessage("Your browser could not save this preset. Export your settings to keep a copy."); return false; }
  }
  function capture() {
    if (!name.trim() || (styles.length >= 20 && !matchingName)) return;
    const values = Object.fromEntries(keys.map((key) => [key, settings[key]])) as Partial<Settings>;
    const next = [...styles.filter((s) => s.name.trim().toLowerCase() !== name.trim().toLowerCase()), { id: matchingName?.id ?? crypto.randomUUID(), name: name.trim(), values }].slice(-20);
    if (save(next)) { setMessage(`Saved “${name.trim()}”.`); setName(""); }
  }
  return <Section heading="Your style presets" icon={<BookmarkPlus size={18} />}>
    <p className="hint">Save terrain, feature, colour and frame choices for another artwork. Presets are stored in this browser; your place, size and special places stay as you chose them.</p>
    <div className="custom-style-save">
      <input aria-label="Custom style name" placeholder="Name this style" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); capture(); } }} />
      <button type="button" disabled={!name.trim() || (styles.length >= 20 && !matchingName)} onClick={capture}><BookmarkPlus size={16} aria-hidden="true" />{matchingName ? "Replace saved style" : "Save style"}</button>
    </div>
    {matchingName && <p className="hint">Saving replaces “{matchingName.name}” with your current choices.</p>}
    {!availableStyles.length && <p className="style-library-empty">Your saved styles will appear here.</p>}
    {styles.length >= 20 && !matchingName && <p className="hint">20 styles saved. Remove a preset or use an existing name to replace it.</p>}
    <div className="custom-style-list">
      {[...availableStyles].reverse().map((style) => {
        const active = keys.every((key) => !(key in style.values) || style.values[key] === settings[key]);
        return <div key={style.id}>
          <button type="button" aria-pressed={active} onClick={() => { onApply(style.values); setMessage(`Applied “${style.name}”.`); }}>{active ? <Check size={15} aria-hidden="true" /> : <BookmarkPlus size={15} aria-hidden="true" />}{style.name}</button>
          <button type="button" aria-label={`Delete style ${style.name}`} onClick={() => { if (save(styles.filter((s) => s.id !== style.id))) setMessage(`Removed “${style.name}”.`); }}><Trash2 size={15} aria-hidden="true" /></button>
        </div>;
      })}
    </div>
    {message && <p className="hint" role="status">{message}</p>}
  </Section>;
}
