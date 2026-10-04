import { useEffect, useId, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RotateCcw, Box, Layers, Grid2X2, ScanLine, Palette, Camera, Focus, X, LoaderCircle } from "lucide-react";
import type { MaterialId, Model, Settings } from "./types";
import "./preview.css";

type View = "perspective" | "top" | "front" | "side";
type Appearance = {
  terrain: string; frame: string;
  background: "warm" | "white" | "dark";
  finish: "matte" | "satin" | "metal";
  lighting: "studio" | "relief" | "daylight";
  shadows: boolean; quality: "balanced" | "high";
};
const defaultAppearance: Appearance = {
  terrain: "#d6d9cc", frame: "#263e43", background: "warm", finish: "matte",
  lighting: "studio", shadows: true, quality: "balanced",
};
const appearanceKey = "contour-studio-preview-v1";
function readAppearance(): Appearance {
  try {
    const value = JSON.parse(localStorage.getItem(appearanceKey) || "null") as Partial<Appearance> | null;
    if (!value || typeof value !== "object") return defaultAppearance;
    return {
      terrain: /^#[0-9a-f]{6}$/i.test(value.terrain || "") ? value.terrain! : defaultAppearance.terrain,
      frame: /^#[0-9a-f]{6}$/i.test(value.frame || "") ? value.frame! : defaultAppearance.frame,
      background: ["warm", "white", "dark"].includes(value.background || "") ? value.background! : "warm",
      finish: ["matte", "satin", "metal"].includes(value.finish || "") ? value.finish! : "matte",
      lighting: ["studio", "relief", "daylight"].includes(value.lighting || "") ? value.lighting! : "studio",
      shadows: typeof value.shadows === "boolean" ? value.shadows : true,
      quality: value.quality === "high" ? "high" : "balanced",
    };
  } catch { return defaultAppearance; }
}
function disposeMaterial(material: THREE.Material) {
  for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
  material.dispose();
}
function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose();
      (Array.isArray(child.material) ? child.material : [child.material]).forEach(disposeMaterial);
    }
  });
}

export default function Preview({ id, model, selected, onSelect, inspect = true, settings }: {
  id: string; model: Model; selected: string | null; onSelect: (s: string | null) => void; inspect?: boolean; settings?: Settings;
}) {
  const host = useRef<HTMLDivElement>(null);
  const appearanceButton = useRef<HTMLButtonElement>(null);
  const appearanceId = useId();
  const [appearance, setAppearance] = useState<Appearance>(readAppearance);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [colourMode, setColourMode] = useState<"print" | "override">("print");
  const [wire, setWire] = useState(false);
  const [explode, setExplode] = useState(false);
  const [frame, setFrame] = useState(true);
  const [grid, setGrid] = useState(true);
  const [isolate, setIsolate] = useState(false);
  const [view, setView] = useState<View>("perspective");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState("");
  const actions = useRef<{ fit: (view: View, selectedOnly?: boolean) => void; update: () => void; snapshot: () => void } | null>(null);
  const chosen = model.parts.find((p) => p.id === selected);
  const previewParts = model.parts.filter((p) => p.kind === "terrain" || p.kind === "frame");
  const canFocus = inspect && !!chosen && (chosen.kind === "terrain" || chosen.kind === "frame");
  const isolateActive = canFocus && isolate;
  const multicolour = model.multicolour?.enabled ? model.multicolour : undefined;
  const printColours = !!multicolour && colourMode === "print";
  const printPalette = (multicolour?.palette || []).map((material) => ({ ...material,
    colour: settings?.[`colour_${material.id}`] || material.colour,
  }));
  const paletteKey = printPalette.map((material) => `${material.id}:${material.colour}`).join(",");
  const paletteEdited = printPalette.some((material, index) => material.colour.toLowerCase() !== multicolour?.palette[index].colour.toLowerCase());
  const materialColours = Object.fromEntries(printPalette.map((material) => [material.id, material.colour]));
  const state = useRef({ wire, explode, frame, grid, selected, onSelect, appearance, isolate, inspect, printColours, materialColours });
  state.current = { wire: inspect && wire, explode: inspect && explode, frame, grid: inspect && grid,
    selected: inspect ? selected : null, onSelect, appearance, isolate: isolateActive, inspect, printColours, materialColours };
  const patchAppearance = (patch: Partial<Appearance>) => setAppearance((previous) => ({ ...previous, ...patch }));

  useEffect(() => {
    try { localStorage.setItem(appearanceKey, JSON.stringify(appearance)); } catch { /* Controls also work with storage disabled. */ }
  }, [appearance]);
  useEffect(() => {
    setColourMode("print"); setIsolate(false); setExplode(false); setWire(false);
    setFrame(true); setView("perspective"); setNotice("");
  }, [id]);
  useEffect(() => {
    if (chosen?.kind === "frame") setFrame(true);
  }, [selected, chosen?.kind]);
  useEffect(() => { if (!canFocus) setIsolate(false); }, [canFocus]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!host.current) return;
    setLoading(true); setError("");
    const el = host.current, s = model.settings;
    const abort = new AbortController();
    let disposed = false, contextUnavailable = false, raf = 0, firstResize = true;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 10000);
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch {
      setError("3D preview needs WebGL. You can still download and inspect the print package below.");
      setLoading(false); return () => abort.abort();
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-label", "3D model. Drag to orbit, pinch or scroll to zoom, and use the view controls for camera presets.");
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.style.touchAction = "none";
    el.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.94;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    const hemisphere = new THREE.HemisphereLight("#ffffff", "#879fa2", 1); scene.add(hemisphere);
    const light = new THREE.DirectionalLight("#fff7e8", 2.4);
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = -s.width; light.shadow.camera.right = s.width;
    light.shadow.camera.top = s.height; light.shadow.camera.bottom = -s.height;
    light.shadow.camera.near = 1; light.shadow.camera.far = Math.max(s.width, s.height) * 5;
    light.shadow.bias = -0.00002; light.shadow.normalBias = 0.08; scene.add(light);
    const fill = new THREE.DirectionalLight("#c2e5ee", 0.4);
    fill.position.set(s.width, 50, -s.height); scene.add(fill);
    const root = new THREE.Group();
    root.rotation.x = -Math.PI / 2; root.position.set(-s.width / 2, 0, s.height / 2); scene.add(root);
    const meshes: THREE.Mesh[] = [];
    const cuts = new THREE.Group(); root.add(cuts);
    const z = Math.max(s.frame_depth + s.frame_height, ...model.parts.map((p) => p.dimensions_mm[2] || 0)) + 0.5;
    const lineMat = new THREE.LineDashedMaterial({ color: "#389598", dashSize: 3, gapSize: 3,
      transparent: true, opacity: 0.65, depthTest: false });
    const { columns, rows } = model.layout;
    for (let i = 1; s.map_format==="artwork" && i < columns; i++) {
      const x = i * s.width / columns;
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 0, z), new THREE.Vector3(x, s.height, z),
      ]), lineMat);
      line.computeLineDistances(); cuts.add(line);
    }
    for (let i = 1; s.map_format==="artwork" && i < rows; i++) {
      const y = i * s.height / rows;
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, y, z), new THREE.Vector3(s.width, y, z),
      ]), lineMat);
      line.computeLineDistances(); cuts.add(line);
    }
    // Render only while something changes; damping schedules its own settling frames.
    function invalidate() {
      if (disposed || contextUnavailable || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0; controls.update(); renderer.render(scene, camera);
      });
    }
    controls.addEventListener("change", invalidate);
    function fit(nextView: View, selectedOnly = false) {
      root.updateMatrixWorld(true);
      const bounds = new THREE.Box3();
      for (const mesh of meshes) if (mesh.visible && (!selectedOnly || mesh.userData.partId === state.current.selected)) bounds.expandByObject(mesh);
      if (bounds.isEmpty()) bounds.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(s.width, z, s.height));
      const centre = bounds.getCenter(new THREE.Vector3());
      const radius = Math.max(1, bounds.getSize(new THREE.Vector3()).length() / 2);
      const vfov = THREE.MathUtils.degToRad(camera.fov);
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
      const distance = radius / Math.sin(Math.min(vfov, hfov) / 2) * 1.12;
      const direction = nextView === "top" ? new THREE.Vector3(0, 1, 0.001)
        : nextView === "front" ? new THREE.Vector3(0, 0.08, 1)
        : nextView === "side" ? new THREE.Vector3(1, 0.08, 0)
        : new THREE.Vector3(0.68, 1.05, 0.78);
      camera.position.copy(centre).add(direction.normalize().multiplyScalar(distance));
      camera.near = Math.max(0.01, radius / 1000); camera.far = Math.max(1000, distance * 12); camera.updateProjectionMatrix();
      controls.target.copy(centre); controls.minDistance = Math.max(1, radius * 0.08); controls.maxDistance = Math.max(1000, distance * 5);
      controls.update(); invalidate();
    }
    function update() {
      const st = state.current, a = st.appearance;
      scene.background = new THREE.Color(a.background === "dark" ? "#26312e" : a.background === "white" ? "#f8f9f7" : "#eeece5");
      const pixelRatio = Math.min(window.devicePixelRatio || 1, a.quality === "high" ? 2 : 1.5);
      if (renderer.getPixelRatio() !== pixelRatio) renderer.setPixelRatio(pixelRatio);
      renderer.shadowMap.enabled = a.shadows; light.castShadow = a.shadows;
      hemisphere.intensity = a.lighting === "relief" ? 0.65 : a.lighting === "daylight" ? 1.6 : 1;
      light.intensity = a.lighting === "relief" ? 3 : a.lighting === "daylight" ? 2 : 2.4;
      light.position.set(-s.width, s.width * (a.lighting === "relief" ? 0.22 : 0.8), s.height * 0.3);
      renderer.toneMappingExposure = a.lighting === "relief" ? 0.85 : 0.95;
      cuts.visible = st.grid && !st.explode && !st.isolate;
      for (const mesh of meshes) {
        const frameMesh = mesh.userData.isFrame, active = mesh.userData.partId === st.selected;
        mesh.visible = (st.frame || !frameMesh) && (!st.isolate || active);
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.wireframe = st.wire;
        mat.color.set(st.printColours && st.materialColours[mesh.userData.materialId]
          ? st.materialColours[mesh.userData.materialId] : frameMesh ? a.frame : a.terrain);
        mat.emissive.set(active ? "#654829" : "#000000"); mat.emissiveIntensity = active ? 0.4 : 0;
        mat.roughness = a.finish === "metal" ? 0.36 : a.finish === "satin" ? 0.48 : 0.84;
        mat.metalness = a.finish === "metal" ? 0.7 : 0.02;
        mesh.position.set(st.explode ? (mesh.userData.col - (columns - 1) / 2) * 22 : 0,
          st.explode ? ((rows - 1) / 2 - mesh.userData.row) * 22 : 0, 0);
        if (st.explode && mesh.userData.detachedFrameOffset) {
          mesh.position.add(mesh.userData.detachedFrameOffset);
        }
      }
      invalidate();
    }
    function snapshot() {
      try {
        renderer.render(scene, camera);
        renderer.domElement.toBlob((blob) => {
          if (disposed) return;
          if (!blob) { setNotice("The image could not be saved. Please try again."); return; }
          const url = URL.createObjectURL(blob), anchor = document.createElement("a");
          anchor.href = url; anchor.download = `${model.name.replace(/[^a-z0-9_-]+/gi, "-") || "contour"}-preview.png`; anchor.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice("PNG saved with your current view.");
        }, "image/png");
      } catch { setNotice("The image could not be saved. Please try again."); }
    }
    actions.current = { fit, update, snapshot }; update();
    const partMap = new Map(model.parts.map((part) => [part.id, part]));
    const materialIds = (model.multicolour?.palette || []).map((material) => material.id);
    const loader = new GLTFLoader();
    fetch(`/api/files/${encodeURIComponent(id)}/preview.glb`, { signal: abort.signal })
      .then((response) => { if (!response.ok) throw new Error("Missing preview"); return response.arrayBuffer(); })
      .then((data) => {
        if (disposed) return;
        loader.parse(data, "", (g) => {
          if (disposed) { disposeObject(g.scene); return; }
          g.scene.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            const integratedFrame = object.name.startsWith("FrameVisual_");
            let partId = integratedFrame ? object.name.slice("FrameVisual_".length) : object.name;
            let materialId: MaterialId = integratedFrame ? "frame" : "ground";
            if (object.name.startsWith("MaterialVisual_")) {
              const semanticName = object.name.slice("MaterialVisual_".length);
              const semanticMaterial = materialIds.find((id) => semanticName.endsWith(`_${id}`));
              if (semanticMaterial) {
                materialId = semanticMaterial;
                partId = semanticName.slice(0, -(semanticMaterial.length + 1));
              }
            }
            const part = partMap.get(partId), match = partId.match(/(?:^|_)([A-T])(\d+)/);
            let detachedFrameOffset: THREE.Vector3 | undefined;
            if (s.frame_mode === "separate" && part?.kind === "frame") {
              const bounds = new THREE.Box3().setFromObject(object);
              // Move each loose rail/corner away from its terrain tile. All
              // visual material regions of attached tiles keep the tile offset.
              const west = bounds.min.x <= 0.1, east = bounds.max.x >= s.width - 0.1;
              const south = bounds.min.y <= 0.1, north = bounds.max.y >= s.height - 0.1;
              const x = Number(east) - Number(west), y = Number(north) - Number(south);
              // Rings and U-shaped pieces span opposing edges, so lift them
              // too: sliding alone would leave their legs against the terrain.
              detachedFrameOffset = new THREE.Vector3(x * 22, y * 22,
                (west && east) || (south && north) || (!x && !y) ? s.frame_depth + s.frame_height + 12 : 0);
            }
            (Array.isArray(object.material) ? object.material : [object.material]).forEach(disposeMaterial);
            object.userData = { isFrame: integratedFrame || part?.kind === "frame" || materialId === "frame", partId, materialId, detachedFrameOffset,
              col: part?.column ?? (match ? Number(match[2]) - 1 : 0),
              row: part?.row ?? (match ? match[1].charCodeAt(0) - 65 : 0) };
            object.material = new THREE.MeshStandardMaterial({ flatShading: true });
            object.castShadow = true; object.receiveShadow = true; meshes.push(object);
          });
          root.add(g.scene); update(); fit("perspective"); setView("perspective"); setLoading(false);
        }, () => { if (!disposed) { setError("The preview could not be opened. Retry loading the saved geometry."); setLoading(false); } });
      }).catch((reason: unknown) => {
        if (!disposed && !(reason instanceof DOMException && reason.name === "AbortError")) {
          setError("The preview could not be loaded. Check your connection and try again."); setLoading(false);
        }
      });
    let down: { x: number; y: number; id: number } | null = null;
    const pointers = new Set<number>(); let multiTouch = false;
    const ray = new THREE.Raycaster();
    function pointerdown(event: PointerEvent) {
      pointers.add(event.pointerId); if (pointers.size > 1) multiTouch = true;
      if (event.button === 0) down = { x: event.clientX, y: event.clientY, id: event.pointerId };
    }
    function pick(event: PointerEvent) {
      pointers.delete(event.pointerId); const wasMulti = multiTouch; if (!pointers.size) multiTouch = false;
      const press = down; down = null;
      if (!state.current.inspect || wasMulti || event.button !== 0 || !press || event.pointerId !== press.id
        || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) return;
      const r = renderer.domElement.getBoundingClientRect(); if (!r.width || !r.height) return;
      ray.setFromCamera(new THREE.Vector2((event.clientX - r.left) / r.width * 2 - 1, -(event.clientY - r.top) / r.height * 2 + 1), camera);
      const hit = ray.intersectObjects(meshes.filter((mesh) => mesh.visible))[0];
      state.current.onSelect(hit?.object.userData.partId ?? null);
    }
    function cancelPointer(event: PointerEvent) { pointers.delete(event.pointerId); down = null; if (!pointers.size) multiTouch = false; }
    function contextLost(event: Event) {
      event.preventDefault(); contextUnavailable = true; cancelAnimationFrame(raf); raf = 0;
      setError("The graphics connection was interrupted. Reload the preview to continue."); setLoading(false);
    }
    renderer.domElement.addEventListener("pointerdown", pointerdown);
    renderer.domElement.addEventListener("pointerup", pick);
    renderer.domElement.addEventListener("pointercancel", cancelPointer);
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    const resize = () => {
      const width = Math.max(1, el.clientWidth), height = Math.max(1, el.clientHeight);
      camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height);
      if (firstResize) { fit("perspective"); firstResize = false; } else invalidate();
    };
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    return () => {
      disposed = true; abort.abort(); cancelAnimationFrame(raf); observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", pointerdown);
      renderer.domElement.removeEventListener("pointerup", pick);
      renderer.domElement.removeEventListener("pointercancel", cancelPointer);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      controls.removeEventListener("change", invalidate); controls.dispose(); disposeObject(scene); lineMat.dispose();
      light.shadow.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); actions.current = null;
    };
  }, [id, model, retry]);
  useEffect(() => { actions.current?.update(); }, [wire, explode, frame, grid, selected, inspect, appearance, isolate, printColours, paletteKey]);
  useEffect(() => {
    actions.current?.update(); actions.current?.fit(view, isolateActive);
    // Fit when changing the assembly layout so loose frames stay in view.
  }, [explode, view, isolateActive]);
  useEffect(() => {
    if (isolateActive) actions.current?.fit(view, true);
  }, [selected, isolateActive, view]);
  const changeView = (next: View) => setView(next);
  const fitArtwork = () => {
    setIsolate(false); state.current.isolate = false; actions.current?.update(); actions.current?.fit(view);
  };
  const focusPiece = () => {
    if (chosen?.kind === "frame" && !frame) {
      setFrame(true); state.current.frame = true; actions.current?.update();
    }
    actions.current?.fit(view, true);
  };

  return (
    <div className="preview polished-preview" aria-busy={loading} onKeyDown={(event) => {
      if (event.key === "Escape" && appearanceOpen) { setAppearanceOpen(false); appearanceButton.current?.focus(); }
    }}>
      <div ref={host} className="preview-host" />
      <div className="preview-toolbar" role="toolbar" aria-label="3D view controls">
        <label className="preview-camera"><Camera size={15} /><span className="sr-only">Camera view</span>
          <select aria-label="Camera view" value={view} disabled={loading || !!error} onChange={(event) => changeView(event.target.value as View)}>
            <option value="perspective">Perspective</option><option value="top">Top view</option><option value="front">Front view</option><option value="side">Side view</option>
          </select>
        </label>
        <button onClick={fitArtwork} disabled={loading || !!error} title="Fit the whole artwork in view" aria-label="Fit the whole artwork in view"><RotateCcw size={16} /></button>
        <button ref={appearanceButton} aria-label="Appearance" title="Preview appearance" aria-expanded={appearanceOpen} aria-controls={appearanceId} className={appearanceOpen ? "active" : ""} onClick={() => setAppearanceOpen((open) => !open)}><Palette size={16} /><span>Appearance</span></button>
        <button onClick={() => actions.current?.snapshot()} disabled={loading || !!error} title="Save a PNG of this view" aria-label="Save image"><Camera size={16} /><span>Save image</span></button>
      </div>
      {appearanceOpen && <div id={appearanceId} className="preview-appearance" role="region" aria-label="Preview appearance">
        <div className="preview-panel-title"><strong>Preview appearance</strong><button onClick={() => { setAppearanceOpen(false); appearanceButton.current?.focus(); }} aria-label="Close appearance controls"><X size={16} /></button></div>
        {multicolour && <>
          <label>Colour view<select aria-label="Colour view" value={colourMode} onChange={(event) => setColourMode(event.target.value as typeof colourMode)}><option value="print">Print colours</option><option value="override">Display override</option></select></label>
          {printColours && <div className="preview-print-palette" aria-label="Print colour palette">
            {printPalette.map((material) => <div key={material.id}><span className="material-swatch" style={{ background: material.colour }} /><span>{material.name}</span><small>{material.colour.toUpperCase()}</small></div>)}
            <p>Change print colours in Style. {paletteEdited ? "Rebuild the model to include these colours in the downloads." : "Assign your loaded filaments in Bambu Studio to match this palette."}</p>
          </div>}
        </>}
        {(!multicolour || !printColours) && <div className="preview-colours">
          <label>Terrain colour<input type="color" value={appearance.terrain} onChange={(event) => patchAppearance({ terrain: event.target.value })} /></label>
          <label>Frame colour<input type="color" value={appearance.frame} onChange={(event) => patchAppearance({ frame: event.target.value })} /></label>
        </div>}
        <label>Surface finish<select aria-label="Surface finish" value={appearance.finish} onChange={(event) => patchAppearance({ finish: event.target.value as Appearance["finish"] })}><option value="matte">Matte clay</option><option value="satin">Satin plastic</option><option value="metal">Brushed metal</option></select></label>
        <label>Background<select aria-label="Background" value={appearance.background} onChange={(event) => patchAppearance({ background: event.target.value as Appearance["background"] })}><option value="warm">Warm paper</option><option value="white">Gallery white</option><option value="dark">Deep forest</option></select></label>
        <label>Lighting<select aria-label="Lighting" value={appearance.lighting} onChange={(event) => patchAppearance({ lighting: event.target.value as Appearance["lighting"] })}><option value="studio">Soft studio</option><option value="relief">Low light · show relief</option><option value="daylight">Bright daylight</option></select></label>
        <label>Render quality<select aria-label="Render quality" value={appearance.quality} onChange={(event) => patchAppearance({ quality: event.target.value as Appearance["quality"] })}><option value="balanced">Balanced</option><option value="high">High detail</option></select></label>
        <label className="preview-checkbox"><input type="checkbox" checked={appearance.shadows} onChange={(event) => patchAppearance({ shadows: event.target.checked })} />Soft shadows</label>
        <button className="preview-reset-appearance" onClick={() => { setAppearance(defaultAppearance); setColourMode("print"); }}>Reset appearance</button>
        <p>{multicolour ? "Lighting, finishes and display overrides only affect this view. The downloads use your generated print palette." : "Display choices are saved on this device. Colours and finishes do not change your printable geometry or filament."}</p>
      </div>}
      {multicolour && <button className={`preview-colour-status ${printColours ? "" : "override"}`} onClick={() => setAppearanceOpen(true)} title="Open print colour palette"><Palette size={13} />{printColours ? paletteEdited ? "Colour preview · rebuild to export" : "Print colours" : "Display override"}</button>}
      {inspect && <div className="preview-inspection-tools" role="toolbar" aria-label="Model inspection">
        <button aria-label={explode ? "Join pieces" : "Separate pieces"} title={explode ? "Join pieces" : "Separate pieces"} aria-pressed={explode} className={explode ? "active" : ""} onClick={() => setExplode((value) => !value)} disabled={loading || !!error}><Layers size={15} /><span>{explode ? "Join pieces" : "Separate pieces"}</span></button>
        <button aria-label="Wireframe" title="Inspect the mesh as wireframe" aria-pressed={wire} className={wire ? "active" : ""} onClick={() => setWire((value) => !value)} disabled={loading || !!error}><ScanLine size={15} /><span>Wireframe</span></button>
        <button aria-label="Seams" title="Show tile seams" aria-pressed={grid} className={grid ? "active" : ""} onClick={() => setGrid((value) => !value)} disabled={loading || !!error || explode || isolateActive}><Grid2X2 size={15} /><span>Seams</span></button>
        {model.settings.frame_mode !== "none" && <button aria-label="Frame" title="Show the frame" aria-pressed={frame} className={frame ? "active" : ""} onClick={() => {
          if (frame && chosen?.kind === "frame") setIsolate(false);
          setFrame((value) => !value);
        }} disabled={loading || !!error}><Box size={15} /><span>Frame</span></button>}
      </div>}
      {inspect && <div className={`preview-piece ${chosen ? "has-selection" : ""}`}>
        <label><span className="sr-only">Inspect a piece</span><select aria-label="Inspect a piece" value={previewParts.some((part) => part.id === selected) ? selected! : ""} onChange={(event) => { onSelect(event.target.value || null); setIsolate(false); if (model.parts.find((part) => part.id === event.target.value)?.kind === "frame") setFrame(true); }}>
          <option value="">Inspect a piece…</option>{previewParts.map((part) => <option key={part.id} value={part.id}>{part.id.replaceAll("_", " ")} · {part.kind}</option>)}
        </select></label>
        {chosen && <><p>{chosen.dimensions_mm.map((n) => n.toFixed(1)).join(" × ")} mm · {chosen.triangles.toLocaleString()} triangles</p>
          {canFocus ? <div><button onClick={focusPiece} disabled={loading || !!error}><Focus size={14} />Focus</button><button aria-pressed={isolate} className={isolate ? "active" : ""} onClick={() => { if (!isolate && chosen?.kind === "frame") setFrame(true); setIsolate((value) => !value); }} disabled={loading || !!error}>{isolate ? "Show all" : "Only this piece"}</button><button onClick={() => { onSelect(null); setIsolate(false); }} aria-label="Clear piece selection"><X size={14} /></button></div> : <p>This assembly accessory is available in the print package.</p>}
        </>}
      </div>}
      <div className="preview-hint">Drag to orbit · Pinch or scroll to zoom · Right-drag to pan{inspect ? " · Select a piece to inspect" : ""}</div>
      {notice && <div className="preview-notice" role="status">{notice}</div>}
      {(loading || error) && <div className="canvas-message preview-message" role={error ? "alert" : "status"}>
        {loading && <LoaderCircle className="spin" size={24} />}<p>{error || "Loading your printable geometry…"}</p>
        {error && <button onClick={() => setRetry((value) => value + 1)}><RotateCcw size={15} />Reload preview</button>}
      </div>}
    </div>
  );
}
