import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Crosshair,
  Hand,
  LockKeyhole,
  Move,
  Scan,
  UnlockKeyhole,
} from "lucide-react";
import type { Bounds, Settings } from "./types";
import { polarArea, longitudeSpan, longitudeOffset, wrapLongitude, artworkRatio, fitArtworkBounds } from "./world";
import PolarMapView from "./PolarMapView";
import { layout } from "./types";
import { symbols } from "./MarkerEditor";

type Mode = "move" | "pan" | "draw";
type Point = { x: number; y: number };
type Rect = { left: number; top: number; right: number; bottom: number };
const corners = ["sw", "se", "ne", "nw"] as const;
function valid(b: Bounds) {
  return (
    Object.values(b).every(Number.isFinite) &&
    b.west < b.east &&
    b.south < b.north &&
    b.east-b.west <= 2 &&
    b.north-b.south <= 2 &&
    b.south >= -85 &&
    b.north <= 85
  );
}
type MapProps = {
  settings: Settings;
  ratioLocked: boolean;
  onRatioLockedChange: (locked: boolean) => void;
  editable?: boolean;
  onBounds: (b: Bounds) => void;
  placingMarker: string | null;
  onPlaceMarker: (lon: number, lat: number) => void;
  onCancelMarker: () => void;
};

export default function MapView(props: MapProps) {
  if (polarArea(props.settings.bounds)) return <PolarMapView {...props} />;
  const b=props.settings.bounds;
  const unwrapped={...props.settings, bounds:{...b,east:b.west+longitudeSpan(b)},
    markers:props.settings.markers.map(m=>({...m,lon:b.west+longitudeOffset(m.lon,b)}))};
  return <StandardMapView {...props} settings={unwrapped}
    onBounds={next=>props.onBounds({...next,west:wrapLongitude(next.west),east:wrapLongitude(next.east)})}
    onPlaceMarker={(lon,lat)=>props.onPlaceMarker(wrapLongitude(lon),lat)} />;
}

function StandardMapView({ settings, ratioLocked: locked, onRatioLockedChange, editable=true, onBounds, placingMarker, onPlaceMarker, onCancelMarker }: MapProps) {
  const host = useRef<HTMLDivElement>(null),
    markerLayer = useRef<HTMLDivElement>(null),
    overlay = useRef<HTMLDivElement>(null),
    box = useRef<HTMLDivElement>(null),
    grid = useRef<HTMLDivElement>(null),
    sizeLabel = useRef<HTMLSpanElement>(null),
    map = useRef<maplibregl.Map | null>(null),
    latest = useRef(settings),
    change = useRef(onBounds),
    repaint = useRef<() => void>(() => {}),
    cancel = useRef<() => void>(() => {});
  const [mode, setMode] = useState<Mode>("move"),
    [error, setError] = useState("");
  const [placementError, setPlacementError] = useState("");
  const [appearance, setAppearance] = useState(() => {
    try { return localStorage.getItem("contour-studio.map-appearance") || "calm"; } catch { return "calm"; }
  });
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;
  function applyAppearance(m: maplibregl.Map, value: string) {
    if (!m.getLayer("basemap")) return;
    m.setPaintProperty("basemap", "raster-saturation", value === "colour" ? 0 : -0.85);
    m.setPaintProperty("basemap", "raster-contrast", value === "contrast" ? 0.25 : value === "colour" ? 0 : -0.1);
    m.setPaintProperty("basemap", "raster-opacity", value === "calm" ? 0.9 : 1);
  }
  useEffect(() => {
    try { localStorage.setItem("contour-studio.map-appearance", appearance); } catch { /* Browser preferences are optional. */ }
    const m = map.current;
    if (m?.isStyleLoaded()) applyAppearance(m, appearance);
  }, [appearance]);
  const modeRef = useRef(mode),
    lockRef = useRef(locked);
  const placement = useRef({ placingMarker, onPlaceMarker, onCancelMarker });
  placement.current = { placingMarker, onPlaceMarker, onCancelMarker };
  const centre=map.current?.getCenter().lng;
  const shift=centre===undefined?0:360*Math.round((centre-(settings.bounds.west+settings.bounds.east)/2)/360);
  latest.current = shift ? {...settings,bounds:{...settings.bounds,west:settings.bounds.west+shift,east:settings.bounds.east+shift},
    markers:settings.markers.map(marker=>({...marker,lon:marker.lon+shift}))} : settings;
  change.current = onBounds;
  modeRef.current = editable ? mode : "pan";
  lockRef.current = locked;

  function fit() {
    const b = latest.current.bounds,
      m = map.current;
    if (!m || !valid(b)) return;
    // A resize and a toolbar click can occur before ResizeObserver has run.
    m.resize();
    m.fitBounds(
      [
        [b.west, b.south],
        [b.east, b.north],
      ],
      {
        padding: {
          top: m.getContainer().clientWidth < 550 ? 120 : 85,
          bottom: 80,
          left: 45,
          right: 45,
        },
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 220,
      },
    );
  }

  useEffect(() => {
    const container = host.current,
      surface = overlay.current,
      selection = box.current;
    if (!container || !surface || !selection) return;
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({
        container,
        renderWorldCopies: true,
        dragRotate: false,
        pitchWithRotate: false,
        maxPitch: 0,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution:
                '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
            },
          },
          layers: [
            {
              id: "basemap",
              type: "raster",
              source: "osm",
              paint: {
                "raster-saturation": -0.85,
                "raster-contrast": -0.1,
                "raster-opacity": 0.9,
              },
            },
          ],
        },
        center: [-1.315, 53.513],
        zoom: 13,
        attributionControl: { compact: true },
      });
    } catch (e) {
      setError(String(e));
      return;
    }
    map.current = m;
    m.touchZoomRotate.disableRotation();
    m.keyboard.disableRotation();
    m.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );

    let draft: Bounds | null = null,
      frame = 0,
      gridKey = "";
    let gesture: {
      pointer: number;
      kind: string;
      start: Point;
      rect: Rect;
      moved: boolean;
    } | null = null;
    function rect(b: Bounds): Rect {
      const nw = m.project([b.west, b.north]),
        se = m.project([b.east, b.south]);
      return { left: nw.x, top: nw.y, right: se.x, bottom: se.y };
    }
    function bounds(r: Rect): Bounds {
      const nw = m.unproject([r.left, r.top]),
        se = m.unproject([r.right, r.bottom]);
      return { west: nw.lng, east: se.lng, north: nw.lat, south: se.lat };
    }
    function paint() {
      frame = 0;
      if (markerLayer.current) {
        markerLayer.current.replaceChildren();
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none';
        for(const trail of latest.current.trails??[]) {
          const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');
          line.setAttribute('points',trail.points.map(([lon,lat])=>{const p=m.project([latest.current.bounds.west+(lon-latest.current.bounds.west+180+360)%360-180,lat]);return `${p.x},${p.y}`;}).join(' '));
          line.setAttribute('fill','none');line.setAttribute('stroke','#b3472e');line.setAttribute('stroke-width','4');line.setAttribute('stroke-linecap','round');line.setAttribute('stroke-linejoin','round');
          const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=trail.name;line.append(title);svg.append(line);
        }
        markerLayer.current.append(svg);
        for (const marker of latest.current.markers) {
          const el = document.createElement("span");
          el.className = "location-symbol";
          el.textContent = symbols[marker.symbol];
          el.title = marker.label;
          el.setAttribute("aria-label", marker.label);
          const p = m.project([marker.lon, marker.lat]);
          el.style.left = `${p.x}px`;
          el.style.top = `${p.y}px`;
          markerLayer.current.append(el);
        }
      }
      const s = latest.current,
        b = draft ?? s.bounds;
      selection!.hidden = !valid(b);
      if (!valid(b)) return;
      const r = rect(b),
        width = r.right - r.left,
        height = r.bottom - r.top;
      selection!.style.transform = `translate3d(${r.left}px,${r.top}px,0)`;
      selection!.style.width = `${width}px`;
      selection!.style.height = `${height}px`;
      selection!.classList.toggle("compact", width < 180 || height < 100);
      const lat = (b.north + b.south) / 2;
      if (sizeLabel.current)
        sizeLabel.current.textContent = `${((b.east - b.west) * 111.32 * Math.cos((lat * Math.PI) / 180)).toFixed(2)} × ${((b.north - b.south) * 111.32).toFixed(2)} km`;
      // Only rebuild tile guides when the physical layout changes, never during a drag.
      const g = layout(s),
        fw = s.frame_mode === "none" ? 0 : s.frame_width;
      const key = [g.columns, g.rows, s.width, s.height, fw].join(":");
      if (grid.current && key !== gridKey) {
        gridKey = key;
        grid.current.replaceChildren();
        for (const axis of ["x", "y"]) {
          const count = axis === "x" ? g.columns : g.rows,
            extent = axis === "x" ? s.width : s.height;
          for (let i = 1; i < Math.min(count, 21); i++) {
            const t = ((i * extent) / count - fw) / (extent - 2 * fw);
            if (t <= 0 || t >= 1) continue;
            const line = document.createElement("span");
            line.className = `selection-grid-${axis}`;
            line.style[axis === "x" ? "left" : "top"] = `${t * 100}%`;
            grid.current.append(line);
          }
        }
      }
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(paint);
    }
    repaint.current = schedule;
    function position(e: PointerEvent): Point {
      const r = container!.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function preview(e: PointerEvent) {
      if (!gesture) return;
      const p = position(e),
        a = gesture;
      if (Math.hypot(p.x - a.start.x, p.y - a.start.y) < 4 && !a.moved) return;
      a.moved = true;
      let next: Rect;
      if (a.kind === "move") {
        const dx = p.x - a.start.x,
          dy = p.y - a.start.y;
        next = {
          left: a.rect.left + dx,
          right: a.rect.right + dx,
          top: a.rect.top + dy,
          bottom: a.rect.bottom + dy,
        };
      } else {
        const drawing = a.kind === "draw";
        const anchor = drawing
          ? a.start
          : {
              x: a.kind.includes("w") ? a.rect.right : a.rect.left,
              y: a.kind.includes("n") ? a.rect.bottom : a.rect.top,
            };
        const sx = drawing
            ? p.x >= anchor.x
              ? 1
              : -1
            : a.kind.includes("w")
              ? -1
              : 1,
          sy = drawing
            ? p.y >= anchor.y
              ? 1
              : -1
            : a.kind.includes("n")
              ? -1
              : 1;
        let w = Math.max(12, (p.x - anchor.x) * sx),
          h = Math.max(12, (p.y - anchor.y) * sy);
        if (lockRef.current && !e.shiftKey) {
          const ratio = artworkRatio(latest.current);
          w = Math.max(w, h * ratio);
          h = w / ratio;
        }
        const x = anchor.x + sx * w,
          y = anchor.y + sy * h;
        next = {
          left: Math.min(anchor.x, x),
          right: Math.max(anchor.x, x),
          top: Math.min(anchor.y, y),
          bottom: Math.max(anchor.y, y),
        };
      }
      const b = bounds(next);
      if (valid(b)) {
        draft = b;
        schedule();
      }
    }
    function finish(commit: boolean) {
      if (!gesture) return;
      const a = gesture;
      gesture = null;
      const result = commit && a.moved ? draft : null;
      draft = null;
      surface!.classList.remove("dragging");
      if (surface!.hasPointerCapture(a.pointer))
        surface!.releasePointerCapture(a.pointer);
      m.dragPan.enable();
      if (result) {
        latest.current = { ...latest.current, bounds: result };
        change.current(result);
      }
      schedule();
      if (a.kind === "draw") {
        modeRef.current = "move";
        setMode("move");
      }
    }
    cancel.current = () => finish(false);
    function down(e: PointerEvent) {
      if (placement.current.placingMarker && e.isPrimary && e.button === 0) {
        e.preventDefault();
        e.stopPropagation();
        const p = position(e),
          location = m.unproject([p.x, p.y]);
        const b = latest.current.bounds;
        if (
          location.lng > b.west &&
          location.lng < b.east &&
          location.lat > b.south &&
          location.lat < b.north
        ) {
          placement.current.onPlaceMarker(
            Number(location.lng.toFixed(6)),
            Number(location.lat.toFixed(6)),
          );
          setPlacementError("");
        } else
          setPlacementError(
            "Choose a point inside the selected box. Click again to place your symbol.",
          );
        return;
      }
      if (
        !e.isPrimary ||
        e.button !== 0 ||
        gesture ||
        modeRef.current === "pan"
      )
        return;
      const target = e.target as HTMLElement;
      const kind =
        modeRef.current === "draw"
          ? "draw"
          : (target.closest<HTMLElement>("[data-corner]")?.dataset.corner ??
            "move");
      if (kind !== "draw" && !selection!.contains(target)) return;
      if (!valid(latest.current.bounds)) return;
      e.preventDefault();
      e.stopPropagation();
      m.stop();
      m.dragPan.disable();
      gesture = {
        pointer: e.pointerId,
        kind,
        start: position(e),
        rect: rect(latest.current.bounds),
        moved: false,
      };
      surface!.setPointerCapture(e.pointerId);
      surface!.classList.add("dragging");
    }
    function move(e: PointerEvent) {
      if (!gesture || gesture.pointer !== e.pointerId) return;
      e.preventDefault();
      preview(e);
    }
    function up(e: PointerEvent) {
      if (!gesture || gesture.pointer !== e.pointerId) return;
      preview(e);
      finish(true);
    }
    function abort(e: PointerEvent) {
      if (gesture?.pointer === e.pointerId) finish(false);
    }
    function wheel(e: WheelEvent) {
      // The overlay is above the map: keep wheel/trackpad zoom available over the box.
      e.preventDefault();
      e.stopPropagation();
      if (!gesture) m.getCanvas().dispatchEvent(new WheelEvent("wheel", e));
    }
    function key(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      placement.current.onCancelMarker();
      setError("");
      finish(false);
      modeRef.current = "move";
      setMode("move");
    }
    function nudge(e: KeyboardEvent) {
      if (
        gesture ||
        modeRef.current !== "move" ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      const r = rect(latest.current.bounds),
        step = e.shiftKey ? 20 : 2;
      const dx =
          e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0,
        dy = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
      const b = bounds({
        left: r.left + dx,
        right: r.right + dx,
        top: r.top + dy,
        bottom: r.bottom + dy,
      });
      if (valid(b)) {
        latest.current = { ...latest.current, bounds: b };
        change.current(b);
        schedule();
      }
    }
    surface.addEventListener("pointerdown", down);
    surface.addEventListener("pointermove", move);
    surface.addEventListener("pointerup", up);
    surface.addEventListener("pointercancel", abort);
    surface.addEventListener("lostpointercapture", abort);
    surface.addEventListener("wheel", wheel, { passive: false });
    selection.addEventListener("keydown", nudge);
    window.addEventListener("keydown", key);
    m.on("move", schedule);
    m.once("load", schedule);
    m.once("load", () => applyAppearance(m, appearanceRef.current));
    let previousWidth = container.clientWidth,
      previousHeight = container.clientHeight;
    const observer = new ResizeObserver(() => {
      m.resize();
      if (
        container.clientWidth !== previousWidth ||
        container.clientHeight !== previousHeight
      ) {
        previousWidth = container.clientWidth;
        previousHeight = container.clientHeight;
        fit();
      }
      schedule();
    });
    observer.observe(container);
    fit();
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      surface.removeEventListener("pointerdown", down);
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerup", up);
      surface.removeEventListener("pointercancel", abort);
      surface.removeEventListener("lostpointercapture", abort);
      surface.removeEventListener("wheel", wheel);
      selection.removeEventListener("keydown", nudge);
      window.removeEventListener("keydown", key);
      repaint.current = () => {};
      cancel.current = () => {};
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    repaint.current();
  }, [settings]);
  useEffect(() => {
    if (!editable) cancel.current();
  }, [editable]);
  useEffect(() => {
    setPlacementError("");
  }, [placingMarker]);
  useEffect(() => {
    fit();
  }, [settings.name, settings.width, settings.height, settings.frame_width, settings.frame_mode]);
  function choose(next: Mode) {
    cancel.current();
    modeRef.current = next;
    setMode(next);
  }
  function toggleRatio() {
    const next = !locked;
    onRatioLockedChange(next);
    if (next) onBounds(fitArtworkBounds({ ...settings.bounds,
      west: wrapLongitude(settings.bounds.west), east: wrapLongitude(settings.bounds.east),
    }, artworkRatio(settings)));
  }

  return (
    <div className="map-view">
      <div ref={host} className="map-host" />
      <div
        ref={overlay}
        className="selection-overlay"
        data-mode={placingMarker ? "marker" : editable ? mode : "pan"}
      >
        <div ref={box} className="selection-box" hidden>
          <div ref={grid} className="selection-grid" aria-hidden="true" />
          <button
            className="selection-move"
            aria-label="Move selected area"
            title="Drag to move. Arrow keys nudge; Shift moves farther."
            tabIndex={editable && !placingMarker && mode === "move" ? 0 : -1}
          >
            <Move size={17} />
            <span>
              Move area
              <small ref={sizeLabel} />
            </span>
          </button>
          {corners.map((corner) => (
            <button
              key={corner}
              className={`map-handle handle-${corner}`}
              data-corner={corner}
              aria-label={`Resize ${corner} corner`}
              title="Drag to resize"
              tabIndex={-1}
            />
          ))}
        </div>
      </div>
      <div ref={markerLayer} className="location-symbols" />
      <div
        className="map-tools"
        role="toolbar"
        aria-label="Area selection tools"
      >
        {editable && !placingMarker && (
          <>
            <button
              onClick={() => choose("move")}
              className={mode === "move" ? "active" : ""}
              aria-pressed={mode === "move"}
            >
              <Move size={16} />
              Move box
            </button>
            <button
              onClick={() => choose("pan")}
              className={mode === "pan" ? "active" : ""}
              aria-pressed={mode === "pan"}
            >
              <Hand size={16} />
              Pan map
            </button>
            <button
              onClick={() => choose(mode === "draw" ? "move" : "draw")}
              className={mode === "draw" ? "active" : ""}
              aria-pressed={mode === "draw"}
            >
              <Scan size={16} />
              {mode === "draw" ? "Cancel drawing" : "Draw new area"}
            </button>
          </>
        )}
        <button onClick={fit}>
          <Crosshair size={16} />
          Fit selection
        </button>
        {editable && !placingMarker && (
          <button
            onClick={toggleRatio}
            aria-pressed={locked}
            title="Lock to your artwork’s proportions. Hold Shift while dragging for a free shape."
          >
            {locked ? <LockKeyhole size={16} /> : <UnlockKeyhole size={16} />}
            {locked ? "Ratio locked" : "Free shape"}
          </button>
        )}
      </div>
      <label className="map-appearance"><span>Map appearance</span><select aria-label="Map appearance" value={appearance} onChange={(e) => setAppearance(e.target.value)}><option value="calm">Calm</option><option value="colour">Full colour</option><option value="contrast">High contrast</option></select></label>
      <div className="map-note" aria-live="polite">
        {placingMarker
          ? placementError ||
            "Click inside the area to place your symbol · Esc to cancel"
          : !editable
            ? "Drag to explore · Change your area in Place"
            : mode === "draw"
              ? "Drag out a new area. Press Esc to cancel."
              : mode === "pan"
                ? "Drag the map to explore. Switch to Move box to adjust your area."
                : "Drag inside the box to move it · Drag a corner to resize"}
      </div>
      {error && <div className="canvas-message">{error}</div>}
    </div>
  );
}
