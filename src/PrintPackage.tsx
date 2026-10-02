import {
  ArrowUpRight,
  Check,
  Download,
  TriangleAlert,
  X,
  FileBox,
  BookOpen,
  Search,
  Printer,
  Box,
  Palette,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Model, Part } from "./types";
import "./preview.css";
export default function PrintPackage({
  jobId,
  model,
  selected,
  onSelect,
  stale,
}: {
  jobId: string;
  model: Model;
  selected: string | null;
  onSelect: (id: string | null) => void;
  stale: boolean;
}) {
  const chosen = model.parts.find((p) => p.id === selected);
  const frameFit = model.model.frame_fit;
  const fileUrl = (file: string) => `/api/files/${encodeURIComponent(jobId)}/${file.split("/").map(encodeURIComponent).join("/")}`;
  const multicolour = model.multicolour?.enabled ? model.multicolour : undefined;
  const colourTiles = multicolour?.tiles || [];
  const chosenColourTile = colourTiles.find((tile) => tile.part_id === selected);
  const filamentCount = new Set(multicolour?.palette.map((material) => material.filament)).size;
  const [filter, setFilter] = useState<"all" | Part["kind"]>("all");
  const [search, setSearch] = useState("");
  const [partsOpen, setPartsOpen] = useState(false);
  const counts = model.parts.reduce<Record<string, number>>((result, part) => {
    result[part.kind] = (result[part.kind] || 0) + (part.quantity || 1);
    return result;
  }, {});
  const physicalPieces = model.parts.reduce((total, part) => total + (part.quantity || 1), 0);
  const checked = model.parts.filter((part) => part.watertight).length;
  const coupons = model.parts.filter((part) => part.kind === "coupon");
  const joiningKey = model.parts.find((part) => part.kind === "key");
  const query = search.trim().toLowerCase();
  const visibleParts = model.parts.filter((part) => (filter === "all" || part.kind === filter)
    && `${part.id.replaceAll("_", " ")} ${part.kind}`.toLowerCase().includes(query));
  const fitsPlate = (part: Part) => part.dimensions_mm[0] <= model.settings.printer_width - 2 * model.settings.margin
    && part.dimensions_mm[1] <= model.settings.printer_height - 2 * model.settings.margin
    && part.dimensions_mm[2] <= model.settings.printer_z;
  useEffect(() => {
    if (!selected) return;
    setPartsOpen(true); setFilter("all"); setSearch("");
  }, [selected]);
  useEffect(() => { setPartsOpen(false); setFilter("all"); setSearch(""); }, [jobId]);
  return (
    <section className="print-package" aria-label="Print files">
      <div className="export-bar">
        <div>
          <span className="eyebrow">PRINT PACKAGE</span>
          <h3>Everything you need to make it.</h3>
        </div>
        <a className="text-link package-download" download href={fileUrl("project.zip")}>
          <Download size={16} />
          Download ZIP
        </a>
      </div>
      <div className="package-overview">
        <span><Box size={15} /><strong>{physicalPieces}</strong> physical {physicalPieces === 1 ? "piece" : "pieces"} · {model.parts.length} {multicolour ? "solid " : ""}STL {model.parts.length === 1 ? "file" : "files"}</span>
        <span className={checked === model.parts.length ? "valid" : "invalid"}>{checked === model.parts.length ? <Check size={15} /> : <TriangleAlert size={15} />}{checked}/{model.parts.length} meshes watertight</span>
      </div>
      <p className="package-help">{multicolour ? "Download the ZIP for colour 3MFs, aligned material STLs, saved settings and the assembly guide. Use the complete solid STL files below for single-colour printing." : "Download the ZIP for all STLs, saved settings, source information and the assembly guide. Place individual STLs flat on your printer bed in the slicer."}</p>
      {model.sources.vectors.buildings && (
        <p className="hint">
          {model.model.features.buildings.toLocaleString()} buildings · Enhanced
          coverage added {model.sources.vectors.buildings.added_buildings.toLocaleString()} outlines.
        </p>
      )}
      {model.model.city_method && model.settings.buildings && <p className="hint" aria-label="City data detail">
        {(model.model.features.mapped_parts||0).toLocaleString()} mapped building parts · {(model.model.features.mapped_roofs||0).toLocaleString()} mapped roofs · {(model.model.features.fallback_height_buildings||0).toLocaleString()} fallback heights.
      </p>}
      {stale && (
        <p className="stale-note">
          These files use an earlier design or geometry version. Update the
          model to include your changes and the latest geometry fixes.
        </p>
      )}
      {multicolour && <section className="multicolour-package" aria-label="Multicolour print files">
        <div className="colour-package-heading">
          <span className="colour-package-icon"><Palette size={22} /></span>
          <div><span className="eyebrow">BAMBU STUDIO · AMS</span><h3>Print your place in colour.</h3><p>{colourTiles.length} colour {colourTiles.length === 1 ? "piece" : "pieces"} · {filamentCount} suggested {filamentCount === 1 ? "filament" : "filaments"}</p></div>
          <a className="text-link" href={fileUrl("Multicolour/readme.txt")} target="_blank" rel="noreferrer"><BookOpen size={15} />Filament guide</a>
        </div>
        <ol className="filament-legend" aria-label="Suggested print filaments">
          {multicolour.palette.map((material) => <li key={material.id}>
            <span className="material-swatch" style={{ background: material.colour }} />
            <span><strong>{material.name}</strong><small>Filament {material.filament} · {material.colour.toUpperCase()}</small></span>
          </li>)}
        </ol>
        <div className="bambu-instructions">
          <strong>Open one colour 3MF per print piece.</strong>
          <p>Keep it as one object with named material parts. Choose your printer, assign those parts to the filaments loaded in your AMS, then slice and check the layer preview. Filament numbers here are suggestions; match them to your own setup. Reuse a filament across regions if you have fewer colours available.</p>
          <details><summary>Using the material STLs instead</summary><p>Select all STLs from one piece’s Materials folder together and import them as one object with multiple parts. Keep their relative positions. Assign the named parts to your loaded filaments; arranging or dropping each region separately loses the alignment.</p></details>
        </div>
        <div className="colour-tile-grid">
          {colourTiles.map((tile) => <article key={tile.part_id} className={`colour-tile-card ${selected === tile.part_id ? "selected" : ""}`}>
            <div className="colour-tile-heading"><button aria-pressed={selected === tile.part_id} onClick={() => onSelect(selected === tile.part_id ? null : tile.part_id)}>{tile.part_id.replaceAll("_", " ")}</button><a download className="colour-3mf-download" aria-label={`Download ${tile.part_id} colour 3MF`} href={fileUrl(tile.file)}><Download size={15} />Colour 3MF</a></div>
            <div className="colour-tile-swatches" aria-label={`${tile.part_id} material colours`}>{tile.materials.map((material) => <span key={material.id} className="material-swatch" title={`${material.name} · filament ${material.filament}`} style={{ background: material.colour }} />)}<small>{tile.materials.length} material {tile.materials.length === 1 ? "part" : "parts"}</small></div>
            <details className="colour-material-files"><summary>Material STLs <span>{tile.materials.length} files</span></summary><ul>{tile.materials.map((material) => <li key={material.id}><span className="material-swatch" style={{ background: material.colour }} /><span><strong>{material.name}</strong><small>Filament {material.filament} · {(material.volume_mm3 / 1000).toFixed(2)} cm³</small></span><a download href={fileUrl(material.file)} aria-label={`Download ${tile.part_id} ${material.name} material STL`}><Download size={14} />STL</a></li>)}</ul></details>
          </article>)}
        </div>
        <p className="colour-file-note">Colour 3MFs contain aligned geometry and material colours. Set your printer, filament profiles and print settings in Bambu Studio. The full solid STLs below remain available for single-colour printing.</p>
        {!!multicolour.instructions.length && <details className="colour-export-notes"><summary>Export &amp; material notes</summary><ul>{multicolour.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}</ul></details>}
      </section>}
      <div className="download-cards">
        <a
          href={fileUrl("assembly-guide.svg")}
          target="_blank"
          rel="noreferrer"
        >
          <BookOpen size={22} />
          <span>
            <strong>Assembly guide</strong>
            <small>Tile positions and joining instructions</small>
          </span>
          <ArrowUpRight size={17} />
        </a>
        <a download href={fileUrl("Assembly.3mf")}>
          <FileBox size={22} />
          <span>
            <strong>3MF assembly</strong>
            <small>Complete model for viewing, not a single-plate layout</small>
          </span>
          <Download size={17} />
        </a>
      </div>
      <details className="assembly-checklist">
        <summary><Printer size={16} />How to print &amp; assemble</summary>
        <ol>
          {(coupons.length > 0 || joiningKey) && <li><strong>Check the fit first.</strong> Print {coupons.length ? "the fit-test halves" : "a joining key"}{coupons.length && joiningKey ? " and one joining key" : ""}, then check the clearance before making all the tiles.
            <div className="assembly-test-files">{[...coupons, ...(joiningKey ? [joiningKey] : [])].map((part) => <a key={part.id} download href={fileUrl(part.file)}><Download size={13} />{part.id.replaceAll("_", " ")}</a>)}</div>
          </li>}
          <li><strong>Print each piece flat side down.</strong> {multicolour ? "Open one colour 3MF per piece, or use the complete solid STL for a single colour." : "Use the individual STLs for separate print plates."} Follow the assembly guide to arrange the tile IDs and check the seams.</li>
          {model.settings.frame_mode === "separate" && <li><strong>Fit the separate frame.</strong> {frameFit && ["chamfered-insert", "rebated-insert"].includes(frameFit.assembly)
            ? `The insert’s ${frameFit.assembly === "chamfered-insert" ? "45° underside chamfer" : "underside rebate"} rests on a ${frameFit.lip_width_mm} mm supporting lip. Dry-fit with ${frameFit.clearance_mm} mm side clearance.${(counts.frame || 0) > 1 ? " Leave the final frame section loose while sliding the insert into place." : " Lower the insert into the frame until it seats on the lip."} Glue only after checking the fit.`
            : "Match each frame piece to its tile position in the assembly guide. Dry-fit the surround before gluing it in place."}</li>}
          <li><strong>Support the assembled artwork.</strong> {joiningKey ? "Insert the joining keys, check the front alignment and glue the seams. " : "Check the front alignment and glue the seams. "}Bond the artwork to a rigid backing panel and attach hanging hardware to the panel.</li>
        </ol>
      </details>
      {chosen && (
        <div className="selected-info">
          <div>
            <strong>Piece {chosen.id.replaceAll("_", " ")}{(chosen.quantity || 1) > 1 ? ` · print ${chosen.quantity}` : ""}</strong>
            <span>{chosen.kind} · {chosen.dimensions_mm.map((n) => n.toFixed(1)).join(" × ")} mm</span>
            {chosen.kind === "terrain" && <span>{Object.entries(chosen.neighbours).filter(([, value]) => value).map(([direction, value]) => `${direction}: ${value}`).join(" · ") || "Single tile · no neighbouring tiles"}</span>}
            <span className={fitsPlate(chosen) ? "valid" : "invalid"}><Printer size={13} />{fitsPlate(chosen) ? "Fits the saved build plate and height" : "Exceeds the saved print area or height"}</span>
            {chosenColourTile && <a className="colour-3mf-download selected-colour-file" download href={fileUrl(chosenColourTile.file)}><Download size={14} />Download this piece in colour · {chosenColourTile.materials.length} material parts</a>}
            {chosen.warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </div>
          <button onClick={() => onSelect(null)} aria-label="Clear selection">
            <X size={16} />
          </button>
        </div>
      )}
      <details className="parts-details" open={partsOpen} onToggle={(event) => setPartsOpen(event.currentTarget.open)}>
        <summary>
          {multicolour ? "Single-colour solid STLs" : "Individual print files"} <span>{model.parts.length} {model.parts.length === 1 ? "file" : "files"}</span>
        </summary>
        <div className="part-filters">
          <label className="part-search"><Search size={15} /><span className="sr-only">Search print pieces</span><input type="search" placeholder="Find a piece…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label><span className="sr-only">Filter print pieces</span><select aria-label="Filter print pieces" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
            <option value="all">All pieces ({physicalPieces})</option>
            {(["terrain", "frame", "key", "coupon"] as const).filter((kind) => counts[kind]).map((kind) => <option key={kind} value={kind}>{kind === "key" ? "Joining keys" : kind === "coupon" ? "Fit coupons" : kind === "frame" ? "Frame pieces" : "Terrain tiles"} ({counts[kind]})</option>)}
          </select></label>
          <span>{visibleParts.length} of {model.parts.length} {model.parts.length === 1 ? "file" : "files"}</span>
        </div>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Individual print files. Scroll horizontally to see all columns.">
          <table>
            <thead>
              <tr>
                <th>Piece</th>
                <th>Size · mm</th>
                <th>Mesh check</th>
                <th>
                  <span className="sr-only">Download</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleParts.map((p) => (
                <tr key={p.id} className={selected === p.id ? "selected" : ""}>
                  <td>
                    <button aria-pressed={selected === p.id} onClick={() => onSelect(selected === p.id ? null : p.id)}>
                      {p.id.replaceAll("_", " ")}
                      {(p.quantity || 1) > 1 ? ` × ${p.quantity}` : ""}
                    </button>
                    <small>
                      {p.kind} · {p.triangles.toLocaleString()} triangles
                    </small>
                  </td>
                  <td>
                    {p.dimensions_mm.map((n) => n.toFixed(1)).join(" × ")}
                    {!fitsPlate(p) && <small className="invalid">Check build plate / height</small>}
                  </td>
                  <td>
                    <span className={p.watertight ? "valid" : "invalid"}>
                      {p.watertight ? (
                        <Check size={14} />
                      ) : (
                        <TriangleAlert size={14} />
                      )}
                      {p.watertight ? "Watertight" : "Check mesh"}
                    </span>
                  </td>
                  <td>
                    <div className="part-downloads">
                    <a
                      className="stl-download"
                      download
                      aria-label={`Download ${p.id} STL`}
                      href={fileUrl(p.file)}
                    >
                      <Download size={16} />
                      STL
                    </a>
                    {p.multicolour_file && <a download className="colour-3mf-download" aria-label={`Download ${p.id} colour 3MF`} href={fileUrl(p.multicolour_file)}><Palette size={14} />3MF</a>}
                    </div>
                  </td>
                </tr>
              ))}
              {!visibleParts.length && <tr><td colSpan={4} className="part-empty">No pieces match this search. <button onClick={() => { setSearch(""); setFilter("all"); }}>Show all pieces</button></td></tr>}
            </tbody>
          </table>
        </div>
        <p className="part-table-note">Dimensions are measured from the exported STL. Size checks use your saved {model.settings.printer_width} × {model.settings.printer_height} × {model.settings.printer_z} mm printer with {model.settings.margin} mm margins. Check orientation and detail in your slicer.</p>
      </details>
      <details className="print-notes">
        <summary>
          <TriangleAlert size={16} />
          Print & assembly notes
          {model.model.warnings.length > 0 && (
            <span>{model.model.warnings.length} notes</span>
          )}
        </summary>
        <ul>
          {model.model.warnings.map((warning, i) => (
            <li key={i}>{warning}</li>
          ))}
          <li>
            Bond the assembled artwork to a rigid backing panel and attach
            hanging hardware to that panel.
          </li>
        </ul>
        <p>
          Elevation {model.model.elevation_m.map((n) => n.toFixed(1)).join("–")}{" "}
          m · {model.model.features.buildings} buildings ·{" "}
          {model.model.features.roads} roads · {model.model.features.water}{" "}
          water features · {model.model.features.markers ?? 0} special places
          {model.model.features.forest_areas !== undefined && <> · {model.model.features.forest_areas} woodland areas</>}
          {model.model.features.field_areas !== undefined && <> · {model.model.features.field_areas} fields</>}
          {model.model.features.grass_areas !== undefined && <> · {model.model.features.grass_areas} grassland areas</>}
          {!!model.model.features.trees && <> · {model.model.features.trees} illustrative trees</>}
        </p>
        <p>
          <a
            href={model.sources.elevation.url}
            target="_blank"
            rel="noreferrer"
          >
            {model.sources.elevation.provider}
          </a>{" "}
          ·{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            © OpenStreetMap contributors
          </a>
          {model.sources.vectors.buildings && <>{" · "}<a
            href={model.sources.vectors.buildings.url}
            target="_blank"
            rel="noreferrer"
          >Overture Maps &amp; building data contributors</a></>}
        </p>
      </details>
    </section>
  );
}
