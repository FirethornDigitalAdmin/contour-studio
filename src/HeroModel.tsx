import { useEffect, useId, useRef, useState } from "react";
import { Expand, Hand, LoaderCircle, Palette, Play, RotateCcw, Rotate3D } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import "./hero-model.css";

const palette: Record<string, string> = {
  ground: "#80A768", water: "#397CA7", forest: "#80A768", fields: "#E9DECA",
  roads: "#E9DECA", buildings: "#E9DECA", frame: "#2B4045",
};
type ViewerActions = {
  separate: (amount: number, animate?: boolean) => void;
  colour: (enabled: boolean) => void;
  drag: (mode: "rotate" | "pan") => void;
  reset: () => void;
  replay: () => void;
};
type Piece = { mesh: THREE.Mesh; origin: THREE.Vector3; offset: THREE.Vector3; material: THREE.MeshStandardMaterial; region: string };
const ease = (t: number) => t * t * (3 - 2 * t);

function disposeTree(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
  });
}

export default function HeroModel() {
  const host = useRef<HTMLDivElement>(null);
  const actions = useRef<ViewerActions | null>(null);
  const instructionsId = useId();
  const sliderId = useId();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [explosion, setExplosion] = useState(0);
  const [coloured, setColoured] = useState(true);
  const [drag, setDrag] = useState<"rotate" | "pan">("rotate");
  const [assembling, setAssembling] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    setStatus("loading"); setColoured(true); setDrag("rotate");
    setAssembling(false); setExplosion(0);
    const abort = new AbortController();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false, broken = false, visible = false, introVisible = false, raf = 0, model: THREE.Object3D | null = null;
    let amount = 0, needsDraw = true, introPending = true, cameraUnchanged = true;
    let animation: { from: number; to: number; duration: number; elapsed: number; last: number; camera: boolean } | null = null;
    const pieces: Piece[] = [];
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 1, 5000);
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { setStatus("error"); return () => abort.abort(); }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Interactive 3D map of Bolton upon Dearne, made from four terrain tiles and four frame pieces");
    canvas.setAttribute("aria-describedby", instructionsId);
    element.appendChild(canvas);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.dampingFactor = 0.09;
    controls.minDistance = 260; controls.maxDistance = 1900;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.zoomSpeed = 0.7;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    scene.add(new THREE.HemisphereLight("#fffdf5", "#b2b6a7", 2));
    const light = new THREE.DirectionalLight("#fff9ed", 3);
    light.position.set(-180, 600, 240);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = light.shadow.camera.bottom = -420;
    light.shadow.camera.right = light.shadow.camera.top = 420;
    light.shadow.camera.near = 1; light.shadow.camera.far = 1400;
    light.shadow.normalBias = 0.3; light.shadow.bias = -0.0001;
    scene.add(light);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2200, 2200), new THREE.ShadowMaterial({ opacity: 0.13 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1;
    floor.receiveShadow = true; scene.add(floor);

    function invalidate() {
      needsDraw = true;
      if (!raf && visible && !document.hidden && !disposed && !broken) raf = requestAnimationFrame(render);
    }
    function pose(value: number) {
      amount = THREE.MathUtils.clamp(value, 0, 1);
      for (const piece of pieces) piece.mesh.position.copy(piece.origin).addScaledVector(piece.offset, amount);
      renderer.shadowMap.needsUpdate = true;
      setExplosion(Math.round(amount * 100));
      invalidate();
    }
    // Fit the actual projected corners, including the separated frame, rather than a sphere.
    function fit() {
      if (!model) return;
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const target = box.getCenter(new THREE.Vector3());
      const direction = new THREE.Vector3(0.62, 1.05, 0.7).normalize();
      camera.position.copy(target).add(direction); camera.lookAt(target); camera.updateMatrixWorld();
      const inverse = camera.matrixWorldInverse;
      const vertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const horizontal = vertical * camera.aspect;
      let distance = 0;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const point = new THREE.Vector3(x, y, z).applyMatrix4(inverse);
        distance = Math.max(distance, Math.abs(point.x) / horizontal + point.z + 1, Math.abs(point.y) / vertical + point.z + 1);
      }
      camera.position.copy(target).addScaledVector(direction, distance * 1.14);
      controls.target.copy(target); controls.update();
      invalidate();
    }
    function stopAnimation() {
      animation = null; introPending = false; setAssembling(false);
    }
    function animate(to: number, duration: number, moveCamera: boolean, delay = 0) {
      stopAnimation();
      if (reducedMotion.matches) { pose(to); if (moveCamera) fit(); return; }
      animation = { from: amount, to, duration, elapsed: -delay, last: 0, camera: moveCamera };
      setAssembling(to === 0); invalidate();
    }
    function startIntro() {
      if (!introPending || !model || !introVisible || document.hidden) return;
      introPending = false;
      if (reducedMotion.matches) { pose(0); fit(); }
      else { pose(1); fit(); animate(0, 2400, true, 550); }
    }
    function render(now: number) {
      raf = 0;
      if (disposed || broken || !visible || document.hidden) return;
      if (animation) {
        const active = animation;
        if (active.last) active.elapsed += Math.min(now - active.last, 50);
        active.last = now;
        const t = THREE.MathUtils.clamp(active.elapsed / active.duration, 0, 1);
        pose(THREE.MathUtils.lerp(active.from, active.to, ease(t)));
        if (active.camera) fit();
        if (t === 1) { animation = null; setAssembling(false); }
      }
      const moving = controls.update();
      if (needsDraw || moving) { renderer.render(scene, camera); needsDraw = false; }
      if ((animation || moving) && !raf) raf = requestAnimationFrame(render);
    }
    const change = () => invalidate();
    const interaction = () => { stopAnimation(); cameraUnchanged = false; };
    controls.addEventListener("change", change);
    controls.addEventListener("start", interaction);
    canvas.addEventListener("wheel", interaction, { passive: true });
    function onKey(event: KeyboardEvent) {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "r", "R"].includes(event.key)) return;
      event.preventDefault(); interaction();
      if (event.key.toLowerCase() === "r") { fit(); cameraUnchanged = true; return; }
      const offset = camera.position.clone().sub(controls.target);
      if (["+", "=", "-"].includes(event.key)) {
        const length = THREE.MathUtils.clamp(offset.length() * (event.key === "-" ? 1.12 : 0.89), controls.minDistance, controls.maxDistance);
        offset.setLength(length);
      } else if (event.shiftKey) {
        const step = offset.length() * 0.04;
        const delta = new THREE.Vector3(event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
          event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0, 0).applyQuaternion(camera.quaternion);
        camera.position.add(delta); controls.target.add(delta); controls.update(); invalidate(); return;
      } else {
        const spherical = new THREE.Spherical().setFromVector3(offset);
        spherical.theta += event.key === "ArrowLeft" ? 0.12 : event.key === "ArrowRight" ? -0.12 : 0;
        spherical.phi = THREE.MathUtils.clamp(spherical.phi + (event.key === "ArrowUp" ? -0.1 : event.key === "ArrowDown" ? 0.1 : 0), 0.1, controls.maxPolarAngle);
        offset.setFromSpherical(spherical);
      }
      camera.position.copy(controls.target).add(offset); controls.update(); invalidate();
    }
    canvas.addEventListener("keydown", onKey);
    function onContextLost(event: Event) {
      event.preventDefault(); broken = true; stopAnimation(); cancelAnimationFrame(raf); raf = 0; setStatus("error");
    }
    canvas.addEventListener("webglcontextlost", onContextLost);
    const resize = new ResizeObserver(() => {
      const width = element.clientWidth, height = element.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height);
      if (model && cameraUnchanged) fit();
      invalidate();
    });
    resize.observe(element);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      introVisible = entry.intersectionRatio >= 0.45;
      if (!visible) { cancelAnimationFrame(raf); raf = 0; if (animation) animation.last = 0; }
      else { startIntro(); invalidate(); }
    }, { threshold: [0, 0.45] });
    intersection.observe(element);
    function onVisibility() {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; if (animation) animation.last = 0; }
      else { startIntro(); invalidate(); }
    }
    function onMotionPreference() {
      if (reducedMotion.matches && animation) { const to = animation.to; stopAnimation(); pose(to); fit(); }
    }
    document.addEventListener("visibilitychange", onVisibility);
    reducedMotion.addEventListener("change", onMotionPreference);
    actions.current = {
      separate(value, animated = false) { introPending = false; if (animated) animate(value / 100, 900, cameraUnchanged); else { stopAnimation(); pose(value / 100); if (cameraUnchanged) fit(); } },
      colour(enabled) { stopAnimation(); for (const piece of pieces) piece.material.color.set(enabled ? palette[piece.region] : piece.region === "frame" ? "#2B4045" : "#e8e2d5"); invalidate(); },
      drag(mode) { stopAnimation(); controls.mouseButtons.LEFT = mode === "pan" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE; controls.touches.ONE = mode === "pan" ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE; },
      reset() { stopAnimation(); cameraUnchanged = true; controls.reset(); fit(); },
      replay() { stopAnimation(); cameraUnchanged = true; pose(1); fit(); animate(0, 2400, true, 550); },
    };
    fetch("./showcase.glb", { signal: abort.signal }).then((response) => {
      if (!response.ok) throw new Error("Model unavailable");
      return response.arrayBuffer();
    }).then((bytes) => new GLTFLoader().parseAsync(bytes, "")).then((gltf) => {
      if (disposed || broken) { disposeTree(gltf.scene); return; }
      model = gltf.scene;
      model.rotation.x = -Math.PI / 2; model.position.set(-200, 0, 140);
      model.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const match = /^MaterialVisual_(Frame_)?([AB])([12])(?:_1)?_(\w+)$/.exec(child.name);
        if (!match || !palette[match[4]]) return;
        const frame = !!match[1], column = Number(match[3]) - 1, row = match[2] === "A" ? 1 : 0;
        const original = Array.isArray(child.material) ? child.material : [child.material];
        original.forEach((material) => material.dispose());
        const material = new THREE.MeshStandardMaterial({ color: palette[match[4]], roughness: 0.9, metalness: 0, flatShading: true });
        child.material = material; child.castShadow = true; child.receiveShadow = true;
        pieces.push({ mesh: child, origin: child.position.clone(), region: match[4], material,
          offset: new THREE.Vector3((column - 0.5) * (frame ? 140 : 74), (row - 0.5) * (frame ? 140 : 74), frame ? 12 : 28) });
      });
      if (!pieces.length) throw new Error("Model has no display pieces");
      scene.add(model);
      setStatus("ready");
      pose(reducedMotion.matches ? 0 : 1); fit(); controls.saveState(); startIntro(); invalidate();
    }).catch((error: unknown) => {
      if (!disposed && !abort.signal.aborted) { broken = true; stopAnimation(); setStatus("error"); console.warn("Contour Studio example could not load", error); }
    });
    return () => {
      disposed = true; abort.abort(); cancelAnimationFrame(raf); actions.current = null;
      resize.disconnect(); intersection.disconnect(); document.removeEventListener("visibilitychange", onVisibility);
      reducedMotion.removeEventListener("change", onMotionPreference);
      canvas.removeEventListener("keydown", onKey); canvas.removeEventListener("wheel", interaction);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      controls.removeEventListener("change", change); controls.removeEventListener("start", interaction); controls.dispose();
      disposeTree(scene); renderer.dispose(); canvas.remove();
    };
  }, [retry, instructionsId]);

  const ready = status === "ready";
  return <figure className="hero-model" aria-label="Explore an example map in 3D">
    <div className="hero-model-heading"><span className="hero-model-badge"><span />LIVE 3D</span><span>Bolton upon Dearne</span></div>
    <div className="hero-model-stage">
      <div className="hero-model-canvas" ref={host} />
      {!ready && <div className="hero-model-poster"><img src="./map-artwork.png" width="1014" height="628" alt="A generated framed map with green land, blue water and pale roads and buildings" />
        <div className="hero-model-loading" role="status">{status === "loading" ? <><LoaderCircle size={17} className="hero-model-spinner" />Loading your little world…</> : <>3D preview unavailable on this device.<button onClick={() => setRetry((value) => value + 1)}>Try again</button></>}</div>
      </div>}
      {ready && <div className="hero-model-hint" aria-hidden="true">{assembling ? "A place. A few pieces. Something yours." : "Go on, give it a spin."}</div>}
    </div>
    <div className="hero-model-controls">
      <div className="hero-model-toolbar">
        <button className="hero-model-explode" disabled={!ready} onClick={() => actions.current?.separate(explosion > 50 ? 0 : 100, true)}><Expand size={16} />{explosion > 50 ? "Bring together" : "Explode model"}</button>
        <button disabled={!ready} aria-pressed={coloured} onClick={() => { setColoured(!coloured); actions.current?.colour(!coloured); }}><Palette size={16} />Colours {coloured ? "on" : "off"}</button>
        <button disabled={!ready} className="hero-model-icon" aria-label="Reset view" title="Reset view" onClick={() => actions.current?.reset()}><RotateCcw size={16} /></button>
      </div>
      <div className="hero-model-separation"><label htmlFor={sliderId}>Separate pieces</label><input id={sliderId} aria-valuetext={`${explosion}% separated`} type="range" min="0" max="100" value={explosion} disabled={!ready} onChange={(event) => actions.current?.separate(Number(event.target.value))} /><output htmlFor={sliderId}>{explosion}%</output></div>
      <div className="hero-model-bottom"><div className="hero-model-drag" role="group" aria-label="Drag mode"><button disabled={!ready} aria-pressed={drag === "rotate"} onClick={() => { setDrag("rotate"); actions.current?.drag("rotate"); }}><Rotate3D size={14} />Rotate</button><button disabled={!ready} aria-pressed={drag === "pan"} onClick={() => { setDrag("pan"); actions.current?.drag("pan"); }}><Hand size={14} />Pan</button></div><button className="hero-model-replay" disabled={!ready} onClick={() => actions.current?.replay()}><Play size={13} />Replay assembly</button></div>
      <p id={instructionsId} className="hero-model-instructions">Drag to {drag === "rotate" ? "rotate" : "pan"} · Scroll or pinch to zoom<span className="hero-model-keyboard">. Keyboard: arrows rotate, Shift + arrows pan, + / − zoom, R resets.</span></p>
      <span className="hero-model-announcement" role="status">{status === "error" ? "3D preview unavailable. Downloads are still available." : ready ? assembling ? "Assembling the example map" : "Interactive map ready" : "Loading interactive map"}</span>
    </div>
    <figcaption>Real generated map · Simplified for web preview<span>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> · <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener noreferrer">Mapzen terrain credits</a></span></figcaption>
  </figure>;
}
