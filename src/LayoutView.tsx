import { shapePath, shapedArtwork } from "./artworkShapes";
import { Check, TriangleAlert, Printer } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { layout, type Settings } from "./types";
import "./preview.css";
export default function LayoutView({
  settings: s,
  fits,
}: {
  settings: Settings;
  fits: boolean;
}) {
  const diagram = useRef<SVGSVGElement>(null);
  const plateButton = useRef<HTMLButtonElement>(null);
  const tileButtons = useRef<(SVGGElement | null)[]>([]);
  const clipId = useId();
  const [mode, setMode] = useState<"artwork" | "plate">("artwork");
  const [selected, setSelected] = useState(0);
  const [space, setSpace] = useState({ width: 760, height: 570 });
  useEffect(() => {
    if (!diagram.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSpace({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(diagram.current);
    return () => observer.disconnect();
  }, []);
  const raw = layout(s),
    columns = Number.isFinite(raw.columns) ? Math.max(1, Math.min(20, Math.ceil(raw.columns) || 1)) : 1,
    rows = Number.isFinite(raw.rows) ? Math.max(1, Math.min(20, Math.ceil(raw.rows) || 1)) : 1;
  const active = Math.min(selected, columns * rows - 1);
  const tileWidth = s.width / columns, tileHeight = s.height / rows;
  const tileName = `${String.fromCharCode(65 + Math.floor(active / columns))}${active % columns + 1}`;
  const drawingWidth = mode === "plate" ? s.printer_width : s.width;
  const drawingHeight = mode === "plate" ? s.printer_height : s.height;
  const scale = Math.max(
    0.01,
    Math.min(
      (space.width - 110) / Math.max(60, drawingWidth, mode === "plate" ? tileWidth + 2 * s.margin : 0),
      (space.height - 90) / Math.max(60, drawingHeight, mode === "plate" ? tileHeight + 2 * s.margin : 0),
    ),
  );
  const width = drawingWidth * scale,
    height = drawingHeight * scale,
    x = (space.width - width) / 2,
    y = (space.height - height) / 2 + 8;
  const frame = s.frame_mode === "none" ? 0 : s.frame_width * scale;
  const cornerRadius = s.frame_mode === "none" ? 0 : s.corner_radius * scale;
  return (
    <div className="layout-view polished-layout">
      <div className="layout-kicker">
        <span className="eyebrow">ONE ARTWORK. PRINTABLE PIECES.</span>
        <h3>Made to fit your printer.</h3>
        <div className="layout-inspection-switch" role="group" aria-label="Layout inspection">
          <button aria-pressed={mode === "artwork"} className={mode === "artwork" ? "active" : ""} onClick={() => setMode("artwork")}>Artwork layout</button>
          <button ref={plateButton} aria-pressed={mode === "plate"} className={mode === "plate" ? "active" : ""} onClick={() => setMode("plate")}><Printer size={14} />Build plate</button>
        </div>
      </div>
      <svg
        ref={diagram}
        className="layout-diagram"
        viewBox={`0 0 ${space.width} ${space.height}`}
        role={mode === "artwork" ? "group" : "img"}
        aria-label={mode === "artwork" ? `${s.width} by ${s.height} millimetre artwork divided into ${columns} columns and ${rows} rows. Use arrow keys to inspect tiles, then Enter to see the build plate.` : `Tile ${tileName}, ${tileWidth.toFixed(1)} by ${tileHeight.toFixed(1)} millimetres, on your ${s.printer_width} by ${s.printer_height} millimetre build plate with ${s.margin} millimetre margins`}
      >
        {mode === "artwork" ? <>
        <defs><clipPath id={clipId}>{shapedArtwork(s) ? <path d={shapePath(s)} transform={`translate(${x} ${y}) scale(${width/100} ${height/100})`} clipRule="evenodd"/> : <rect x={x} y={y} width={width} height={height} rx={cornerRadius} />}</clipPath></defs>
        <line
          x1={x}
          x2={x + width}
          y1={y - 24}
          y2={y - 24}
          className="dimension-line"
        />
        <line
          x1={x}
          x2={x}
          y1={y - 29}
          y2={y - 19}
          className="dimension-line"
        />
        <line
          x1={x + width}
          x2={x + width}
          y1={y - 29}
          y2={y - 19}
          className="dimension-line"
        />
        <text
          x={space.width / 2}
          y={y - 34}
          textAnchor="middle"
          className="dimension-text"
        >
          {s.width} mm
        </text>
        <line
          x1={x - 28}
          x2={x - 28}
          y1={y}
          y2={y + height}
          className="dimension-line"
        />
        <line
          x1={x - 33}
          x2={x - 23}
          y1={y}
          y2={y}
          className="dimension-line"
        />
        <line
          x1={x - 33}
          x2={x - 23}
          y1={y + height}
          y2={y + height}
          className="dimension-line"
        />
        <text
          transform={`translate(${x - 42},${y + height / 2}) rotate(-90)`}
          textAnchor="middle"
          className="dimension-text"
        >
          {s.height} mm
        </text>
        {shapedArtwork(s) ? <path d={shapePath(s)} transform={`translate(${x} ${y}) scale(${width/100} ${height/100})`} fill="#e3e7d9" fillRule="evenodd"/> : <><rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={cornerRadius}
          fill="#414a41"
        />
        <rect
          x={x + frame}
          y={y + frame}
          width={Math.max(1, width - frame * 2)}
          height={Math.max(1, height - frame * 2)}
          rx={Math.max(0, cornerRadius - frame)}
          fill="#e3e7d9"
        /></>}
        <g clipPath={`url(#${clipId})`}>
        {Array.from({ length: columns * rows }, (_, i) => {
          const col = i % columns,
            row = Math.floor(i / columns);
          return (
            <g key={i} ref={(element) => { tileButtons.current[i] = element; }} className="layout-tile" role="button" tabIndex={active === i ? 0 : -1}
              aria-label={`Inspect tile ${String.fromCharCode(65 + row)}${col + 1}`} aria-pressed={active === i}
              onClick={() => setSelected(i)} onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(i); setMode("plate"); plateButton.current?.focus(); return; }
                const next = event.key === "ArrowRight" ? Math.min(columns * rows - 1, i + 1)
                  : event.key === "ArrowLeft" ? Math.max(0, i - 1)
                  : event.key === "ArrowDown" ? Math.min(columns * rows - 1, i + columns)
                  : event.key === "ArrowUp" ? Math.max(0, i - columns)
                  : event.key === "Home" ? 0 : event.key === "End" ? columns * rows - 1 : null;
                if (next !== null) { event.preventDefault(); setSelected(next); tileButtons.current[next]?.focus(); }
              }}>
              <title>Tile {String.fromCharCode(65 + row)}{col + 1} · {tileWidth.toFixed(1)} × {tileHeight.toFixed(1)} mm. Select to inspect.</title>
              <rect
                x={x + (col * width) / columns}
                y={y + (row * height) / rows}
                width={width / columns}
                height={height / rows}
                fill={active === i ? "#ba745339" : "transparent"}
                stroke={active === i ? "#a95035" : "#faf8f2"}
                strokeWidth={active === i ? "2.5" : "1.5"}
                strokeDasharray={active === i ? undefined : "5 4"}
              />
              <text
                x={x + ((col + 0.5) * width) / columns}
                y={y + ((row + 0.5) * height) / rows + 5}
                textAnchor="middle"
                className="tile-id"
                style={{ fontSize: columns > 10 || rows > 10 ? 11 : 16 }}
              >
                {String.fromCharCode(65 + row)}
                {col + 1}
              </text>
            </g>
          );
        })}
        </g>
        <text
          x={x + width}
          y={y + height + 30}
          textAnchor="end"
          className="dimension-text"
        >
          NORTH
        </text>
        <path d={`M ${x + width - 88} ${y + height + 32} v -13 m -4 5 4 -5 4 5`} fill="none" stroke="#6c785e" strokeWidth="1.5" />
        </> : <>
          <rect x={x} y={y} width={width} height={height} rx={8} fill="#dce1d3" stroke="#87967b" strokeWidth={2} />
          <rect x={x + s.margin * scale} y={y + s.margin * scale} width={Math.max(0, width - 2 * s.margin * scale)} height={Math.max(0, height - 2 * s.margin * scale)} fill="#f4f5ed" stroke="#8c997f" strokeDasharray="5 4" />
          <rect x={x + (width - tileWidth * scale) / 2} y={y + (height - tileHeight * scale) / 2} width={tileWidth * scale} height={tileHeight * scale} fill={fits ? "#b7c7a3" : "#e1b29f"} stroke={fits ? "#526b3e" : "#aa432e"} strokeWidth={2} />
          <text x={space.width / 2} y={y + height / 2 + 5} textAnchor="middle" className="tile-id">{tileName}</text>
          <text x={space.width / 2} y={y - 13} textAnchor="middle" className="dimension-text">{s.printer_width} × {s.printer_height} mm build plate</text>
          <text x={space.width / 2} y={y + height + 25} textAnchor="middle" className="dimension-text">{s.margin} mm clear margin on every side</text>
        </>}
      </svg>
      <div className="layout-selected-tile">
        <label>Inspect tile<select aria-label="Inspect tile" value={active} onChange={(event) => setSelected(Number(event.target.value))}>{Array.from({ length: columns * rows }, (_, index) => <option key={index} value={index}>{String.fromCharCode(65 + Math.floor(index / columns))}{index % columns + 1}</option>)}</select></label>
        <span>Nominal size {tileWidth.toFixed(1)} × {tileHeight.toFixed(1)} mm</span>
      </div>
      <div className={`layout-result ${fits ? "" : "invalid"}`} role="status">
        {fits ? <Check size={18} /> : <TriangleAlert size={18} />}
        <span>
          <strong>
            {columns * rows}{" "}
            {columns * rows === 1 ? "tile" : "tiles"}
          </strong>{" "}
          · {tileWidth.toFixed(1)} × {tileHeight.toFixed(1)} mm each
        </span>
        <span className="plate-fit">
          <Printer size={16} />
          {fits ? "Fits your build plate" : "Check the tile layout"}
        </span>
      </div>
      <p className="layout-planning-note">Planning estimate. The print package checks the final STL dimensions and model height.</p>
    </div>
  );
}
