import { Check, Mountain } from "lucide-react";
import type { Settings } from "./types";
import { NumberField, Section } from "./Controls";

type TerrainStyle = Settings["terrain_style"];
const choices: { id: TerrainStyle; name: string; description: string }[] = [
  { id: "smooth", name: "Smooth", description: "Flowing, natural hills" },
  { id: "terraced", name: "Terraced", description: "Stacked contour layers" },
  { id: "sculpted", name: "Sculpted", description: "Soft shelves & rounded ridges" },
  { id: "faceted", name: "Faceted", description: "Angular, geometric slopes" },
];
const qualityLevels = [
  { name: "Draft", resolution: 128, note: "Quick experiments · less detail" },
  { name: "Standard", resolution: 384, note: "A balance of detail and generation time" },
  { name: "Fine", resolution: 640, note: "Smoother curves · recommended for finished artwork" },
  { name: "Ultra", resolution: 1024, note: "Finest curves · longest generation and larger files" },
];

// Illustrative relief samples, generated once. Every card shows the same hills.
function swatch(style: TerrainStyle) {
  if (style === "terraced") return <img src="./terrain-terraced.svg" alt="" />;
  const n = style === "faceted" ? 7 : 36;
  const height = (u: number, v: number) => {
    let h = 0.92 * Math.exp(-((u - 0.38) ** 2 / 0.045 + (v - 0.43) ** 2 / 0.11))
      + 0.54 * Math.exp(-((u - 0.76) ** 2 / 0.032 + (v - 0.64) ** 2 / 0.07));
    const band = h * 5, level = Math.floor(band);
    if (style === "sculpted") {
      const t = Math.max(0, Math.min(1, (band - level - 0.2) / 0.6));
      h = (level + t * t * (3 - 2 * t)) / 5;
    }
    return h;
  };
  const point = (u: number, v: number) => [90 + (u - v) * 76, 38 + (u + v) * 27 - height(u, v) * 43];
  const paths: { d: string; fill: string }[] = [];
  for (let sum = 0; sum < 2 * n - 1; sum++) {
    for (let i = Math.max(0, sum - n + 1); i <= Math.min(n - 1, sum); i++) {
      const j = sum - i;
      const corners = [[i / n, j / n], [(i + 1) / n, j / n], [(i + 1) / n, (j + 1) / n], [i / n, (j + 1) / n]];
      for (const indices of [[0, 1, 2], [0, 2, 3]]) {
        const triangle = indices.map(k => corners[k]);
        const heights = triangle.map(([u, v]) => height(u, v));
        const light = Math.max(29, Math.min(78, 65 + (heights[0] - heights[1]) * n * 8 - (heights[1] - heights[2]) * n * 3));
        paths.push({ d: triangle.map(([u, v], k) => `${k ? "L" : "M"}${point(u, v).map(x => x.toFixed(1)).join(",")}`).join("") + "Z", fill: `hsl(88 15% ${light.toFixed(0)}%)` });
      }
    }
  }
  return (
    <svg viewBox="0 0 180 108" aria-hidden="true" focusable="false">
      <path d="M14 71 90 43 166 71 90 103Z" fill="#d5d8c9" opacity=".45" />
      <path d="M14 65 90 92 166 65 166 72 90 99 14 72Z" fill="#7f8b70" />
      {paths.map((p, i) => <path key={i} d={p.d} fill={p.fill} stroke={p.fill} strokeWidth=".3" />)}
    </svg>
  );
}
const samples = Object.fromEntries(choices.map(choice => [choice.id, swatch(choice.id)]));

export default function TerrainStyles({ settings: s, onChange }: {
  settings: Settings;
  onChange: (values: Partial<Settings>) => void;
}) {
  const style = s.terrain_style ?? "smooth";
  const qualityIndex = s.resolution < 256 ? 0 : s.resolution < 512 ? 1 : s.resolution < 832 ? 2 : 3;
  const quality = qualityLevels[qualityIndex];
  const custom = !qualityLevels.some(level => level.resolution === s.resolution);
  const inset = s.frame_mode === "none" ? 0 : s.frame_width * 2;
  const spacing = Math.max(s.width - inset, s.height - inset) / s.resolution;
  return (
    <Section heading="Land contours" icon={<Mountain size={18} />} description={`${choices.find(choice => choice.id === style)?.name} · ${s.exaggeration}× height · ${custom ? "Custom" : quality.name} quality`} group="style-options">
      <p className="hint">Choose how the hills and valleys are shaped.</p>
      <div className="terrain-styles" role="group" aria-label="Land contour styles">
        {choices.map(choice => (
          <button type="button" key={choice.id} aria-pressed={style === choice.id}
            onClick={() => onChange({ terrain_style: choice.id })}>
            <span className="terrain-swatch">{samples[choice.id]}</span>
            <span className="terrain-choice-title"><strong>{choice.name}</strong>
              <span className="choice-indicator" aria-hidden="true">{style === choice.id && <Check size={12} />}</span>
            </span>
            <small>{choice.description}</small>
          </button>
        ))}
      </div>
      {(style === "terraced" || style === "sculpted") && (
        <NumberField label="Contour height · mm" value={s.contour_height ?? 1.2}
          min={0.2} max={10} step={0.2} onChange={contour_height => onChange({ contour_height })}
          hint="Smaller values create more layers. Try 0.4–0.8 mm for flatter places." />
      )}
      {style === "faceted" && (
        <NumberField label="Facet size · mm" value={s.facet_size ?? 12}
          min={3} max={40} step={1} onChange={facet_size => onChange({ facet_size })}
          hint="Larger facets create bolder, more angular slopes." />
      )}
      <div className="terrain-adjustments">
          <NumberField label="Height multiplier" value={s.exaggeration} min={0.1} max={30} step={0.1}
            onChange={exaggeration => onChange({ exaggeration })} />
        <p className="hint">Increase height to bring out gentle slopes.</p>
      </div>
      <div className="terrain-quality">
        <div className="terrain-quality-heading"><h4>Surface quality</h4><strong>{custom ? "Custom" : quality.name}</strong></div>
        <div className="quality-meter" role="meter" aria-label="Surface quality"
          aria-valuemin={64} aria-valuemax={1024} aria-valuenow={s.resolution}
          aria-valuetext={`${custom ? "Custom" : quality.name}, ${s.resolution} terrain samples`}>
          {qualityLevels.map((level, i) => <span key={level.name} className={i <= qualityIndex ? "filled" : ""} />)}
        </div>
        <div className="quality-options" role="group" aria-label="Surface quality presets">
          {qualityLevels.map(level => <button type="button" key={level.name}
            aria-pressed={s.resolution === level.resolution}
            onClick={() => onChange({ resolution: level.resolution })}>{level.name}</button>)}
        </div>
        <p className="quality-description">{custom ? "Custom detail from your advanced settings" : quality.note}</p>
        <p className="hint">About {spacing.toFixed(2)} mm between surface samples. Higher quality refines curves; real detail depends on the elevation data.{style === "faceted" ? " Faceted keeps its intentionally angular shape." : ""}</p>
        <details className="advanced">
          <summary>Terrain detail & smoothing</summary>
          <NumberField label="Smoothing · samples" value={s.smoothing} min={0} max={5} step={0.1}
            onChange={smoothing => onChange({ smoothing })} hint="Softens the elevation data; zero keeps its original texture." />
          <NumberField label="Base thickness · mm" value={s.base} min={3} max={20} step={0.5}
            onChange={base => onChange({ base })} hint="A thicker base gives the tiles more strength." />
          <NumberField label="Grid samples · long edge" value={s.resolution} min={64} max={1024} step={1} integer
            onChange={resolution => onChange({ resolution })}
            hint="Use any whole number from 64 to 1,024. Fine uses 640; more samples take longer to build." />
        </details>
      </div>
      <p className="hint terrain-sample-note">Illustrative samples. Generate or update your model to see these contours on your place and in your print files.</p>
    </Section>
  );
}
