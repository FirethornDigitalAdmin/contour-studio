import { useEffect, useRef, useState, lazy, Suspense } from "react";
import {
  Layers,
  Map,
  Box,
  Download,
  Check,
  Search,
  Printer,
  Mountain,
  TriangleAlert,
  LoaderCircle,
  FolderOpen,
  Save,
  ArrowRight,
  ArrowLeft,
  X,
  Upload,
  MapPin,
  Ruler,
  Palette,
  CircleCheck,
  ChevronRight,
  Undo2,
  Redo2,
  Plus,
  BookmarkCheck,
  CircleHelp,
  Monitor,
  ExternalLink,
  Github,
  Settings as SettingsIcon,
} from "lucide-react";
import CoffeeLink from "./CoffeeLink";
import AppUpdates from "./AppUpdates";
import BrandMark from "./BrandMark";
import Creator from "./Creator";
import { repository, releaseUrl } from "./distribution";
import { api, hostedWorkspace, starterPlaces } from "./hosted";
import { ApiError, layout, type Settings, type Job } from "./types";
import { Field, NumberField, Section } from "./Controls";
import { collection, activeMapSettings } from "./formats";
import { TilePicker } from "./FormatEditor";
import PuzzleLayout from "./PuzzleLayout";
import CollectionLayout from "./CollectionLayout";
import SettingsPanel from "./SettingsPanel";
import LayoutView from "./LayoutView";
import PrintPackage from "./PrintPackage";
import WorkspaceBoundary from "./WorkspaceBoundary";
import useDesignHistory from "./useDesignHistory";
import ProjectStart, { ProjectChooser } from "./ProjectStart";
import { configureProject, projectNames, projectType, readDesigns, saveDesign, type ProjectType, type WallContent, type SavedDesign } from "./projectWorkflow";
import "./project-workspace.css";
import { restoreDraft, sameDesign, validateDesign } from "./validation";
import { selectionAreaKm2, MAX_BUILDING_AREA_KM2, validBounds, insideBounds, centreLongitude, placeBounds, artworkRatio, fitArtworkBounds } from "./world";
const MapView = lazy(() => import("./MapView"));
const TraceEditor = lazy(() => import("./TraceEditor"));
const Preview = lazy(() => import("./Preview"));

const steps = [
  { name: "Place", title: "Choose your place.", description: "Choose your location, artwork size and tile layout together. Move and resize the selection on the map.", next: "Design your artwork" },
  { name: "Design", title: "Make it yours.", description: "Start with a style. Switch features on or off, then open the details you want to change.", next: "Prepare to print" },
  { name: "Print", title: "Prepare every piece.", description: "Choose your printer. We’ll organise your map, frame and joining pieces for printing.", next: "Prepare print plates" },
];
const MAKE_STEP = 2;
type Project = import("./ProjectStart").GeneratedProject;
type SearchResult = { display_name: string; lon: string; lat: string };
type View = "map" | "layout" | "3d" | "trace";

export default function App() {
  const { settings, setSettings, resetSettings, patch, undo, redo, canUndo, canRedo } = useDesignHistory();
  const [job, setJob] = useState<Job | null>(null);
  const [step, setStep] = useState(0);
  const [view, setView] = useState<View>("map");
  const [home, setHome] = useState(true);
  const [hasDraft, setHasDraft] = useState(false);
  const [designs, setDesigns] = useState(readDesigns);
  const designId = useRef<string>(crypto.randomUUID());
  const [chooserMode, setChooserMode] = useState<"new" | "change">("new");
  const [chooserSession, setChooserSession] = useState(0);
  const chooserDialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [draftTrailPoints,setDraftTrailPoints]=useState<[number,number][]>([]);
  const [placingMarker, setPlacingMarker] = useState<string | null>(null);
  const [mapRatioLocked, setMapRatioLocked] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [draftStatus, setDraftStatus] = useState("Draft saved on this device");
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState("");
  const defaultsRef = useRef<Settings | null>(null);
  const searchVersion = useRef(0);
  const draftSnapshot = useRef<string | null>(null);
  draftSnapshot.current = settings ? JSON.stringify({ version: 1, workflowVersion: 3, settings, id: designId.current, jobId: job?.id, step, view, mapRatioLocked }) : null;
  const [navigation, setNavigation] = useState("studio");
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const helpButton = useRef<HTMLButtonElement>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const creatorDialog = useRef<HTMLDialogElement>(null);
  const creatorCredit = useRef<HTMLButtonElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLElement>(null);
  const printPackage = useRef<{ open: () => void }>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const busy =
    starting || job?.status === "running" || job?.status === "queued";
  const model = job?.result;

  useEffect(() => {
    let alive = true;
    Promise.all([api<Settings>("/preset"), api<Job | null>("/active-job")])
      .then(async ([defaults, active]) => {
        if (!alive) return;
        defaultsRef.current = defaults;
        let restored = { ...defaults, ...active?.settings };
        let savedJob: Job | null = null;
        if (!active) {
          try {
            const draft = JSON.parse(localStorage.getItem("contour-studio.draft.v1") || "null");
            if (draft?.version === 1 && draft.settings) {
              designId.current = typeof draft.id === "string" ? draft.id : designId.current;
              const savedSettings = restoreDraft(draft.settings, defaults);
              if (!savedSettings) throw new Error("Invalid draft");
              setHasDraft(true);
              restored = savedSettings;
              if (draft.jobId) savedJob = await api<Job>("/jobs/" + encodeURIComponent(draft.jobId)).catch(() => null);
              if (savedJob?.result) savedJob = { ...savedJob, result: { ...savedJob.result, settings: { ...defaults, ...savedJob.result.settings, building_source: savedJob.result.settings.building_source ?? "osm", markers: savedJob.result.settings.markers ?? [] } } };
              if (!alive) return;
              setStep(draft.workflowVersion === 3
                ? (Number.isInteger(draft.step) && draft.step >= 0 && draft.step < steps.length ? draft.step : 0)
                : draft.workflowVersion === 2 ? ({ 0: 0, 1: 0, 2: 1, 3: 1, 4: MAKE_STEP }[draft.step as number] ?? 0)
                : ({ 0: 0, 1: 1, 2: MAKE_STEP }[draft.step as number] ?? 0));
              setView(["map", "layout", "3d", "trace"].includes(draft.view) ? draft.view : "map");
              setMapRatioLocked(draft.mapRatioLocked !== false);
              setDraftStatus("Your last design was restored");
            }
          } catch { setDraftStatus("A saved draft could not be restored. Your completed projects are available."); }
        }
        if (!alive) return;
        setSettings({ ...restored, markers: restored.markers ?? [] });
        if (active) {
          setHome(false);
          setHasDraft(true);
          setJob(active);
          setStep(MAKE_STEP);
          setView("3d");
        } else if (savedJob?.result) setJob(savedJob);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    api<Project[]>("/projects")
      .then((v) => {
        if (alive) setProjects(v);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!settings || !hasDraft) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("contour-studio.draft.v1", JSON.stringify({ version: 1, workflowVersion: 3, settings, id: designId.current, jobId: job?.id, step, view, mapRatioLocked }));
        setDesigns(saveDesign({ id: designId.current, updated: new Date().toISOString(), settings, jobId: job?.id, step, view, mapRatioLocked }));
        setDraftStatus("All changes saved on this device");
      } catch { setDraftStatus("Draft saving unavailable · Save settings to keep a copy"); }
    }, 350);
    return () => clearTimeout(timer);
  }, [settings, job?.id, step, view, mapRatioLocked, hasDraft]);
  useEffect(() => {
    const flush = () => {
      if (!hasDraft || !draftSnapshot.current) return;
      try { localStorage.setItem("contour-studio.draft.v1", draftSnapshot.current); const snapshot = JSON.parse(draftSnapshot.current); saveDesign({ ...snapshot, updated: new Date().toISOString() }); } catch { /* Keep exported settings available if browser storage is full. */ }
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => { window.removeEventListener("pagehide", flush); window.removeEventListener("beforeunload", flush); };
  }, [hasDraft]);
  useEffect(() => {
    if (placingMarker && !placingMarker.startsWith("trail:") && !settings?.markers.some((marker) => marker.id === placingMarker)) setPlacingMarker(null);
  }, [settings?.markers, placingMarker]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (busy || document.querySelector("dialog[open]") || target.closest("input, textarea, select, [contenteditable=true]") || !(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === "z") { event.preventDefault(); setPlacingMarker(null); if (event.shiftKey) redo(); else undo(); }
      else if (event.key.toLowerCase() === "y") { event.preventDefault(); setPlacingMarker(null); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, undo, redo]);
  useEffect(() => {
    if (!job || !["running", "queued"].includes(job.status)) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api<Job>("/jobs/" + job.id);
        if (!alive) return;
        setConnectionError(false);
        setJob(next);
        if (next.status === "complete") {
          setView("3d");
          setStep(MAKE_STEP);
          api<Project[]>("/projects")
            .then((v) => {
              if (alive) setProjects(v);
            })
            .catch(() => {});
        } else if (next.status === "failed") setError(next.message);
        else timer = setTimeout(poll, 1300);
      } catch (e) {
        if (alive) {
          if (e instanceof ApiError && e.status === 404) {
            const message = "Generation was interrupted when the app stopped. Your settings are still here; try generating again.";
            setJob({ ...job, status: "failed", message });
            setError(message);
            setConnectionError(false);
            return;
          }
          setConnectionError(true);
          timer = setTimeout(poll, 4000);
        }
      }
    };
    timer = setTimeout(poll, 800);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [job?.id, job?.status]);
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
    if (window.matchMedia("(max-width: 800px)").matches)
      window.scrollTo({ top: 0 });
  }, [step]);
  useEffect(() => {
    if (placingMarker && window.matchMedia("(max-width: 800px)").matches)
      document
        .querySelector(".canvas-wrap")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [placingMarker, view]);

  useEffect(() => {
    if (hostedWorkspace || !settings) return;
    const onMenu = (event: Event) => {
      const command = (event as CustomEvent<string>).detail;
      if (!["new-project", "home", "format", "place", "design", "frame", "make", "projects", "save-design", "import-design", "help"].includes(command)) return;
      if (busy && ["new-project", "home", "format", "place", "design", "frame", "make", "projects", "import-design"].includes(command)) return;
      document.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach(open => open.close());
      switch (command) {
        case "new-project": showChooser("new"); break;
        case "home": showProjects(); break;
        case "format": revealSettingsGroup("Size & layout"); break;
        case "frame": revealSettingsGroup("Frame & caption"); break;
        case "place": go(0); break;
        case "design": go(1); break;
        case "make": go(MAKE_STEP); break;
        case "projects": showProjects(); break;
        case "save-design": saveSettings(); break;
        case "import-design": importInput.current?.click(); break;
        case "help": helpDialog.current?.showModal(); break;
      }
    };
    window.addEventListener("contour:menu", onMenu);
    return () => window.removeEventListener("contour:menu", onMenu);
  });

  if (!settings)
    return (
      <div className="startup">
        <span className="brand-mark">
          <Layers size={27} />
        </span>
        <h1>Contour Studio</h1>
        <p role="status">{error || "Opening your workspace…"}</p>
        {error ? (
          <button onClick={() => location.reload()}>Try again</button>
        ) : (
          <LoaderCircle className="spin" size={22} />
        )}
      </div>
    );
  const s = settings;
  const validationIssues = validateDesign(s);
  const grid = layout(s);
  const count = collection(s) ? s.map_tiles.length : s.map_format==="jigsaw" ? s.puzzle_columns*s.puzzle_rows : grid.columns * grid.rows;
  const tileNoun = s.map_format==="jigsaw" ? "pieces" : collection(s) ? "maps" : count === 1 ? "tile" : "tiles";
  const displaySize = (v:number) => Number(v.toFixed(1));
  const frameWidth = s.frame_mode === "none" ? 0 : s.frame_width;
  const fits =
    Number.isFinite(count) &&
    count > 0 &&
    count <= 100 &&
    grid.columns <= 20 &&
    grid.rows <= 20 &&
    s.width / grid.columns <= s.printer_width - 2 * s.margin &&
    s.height / grid.rows <= s.printer_height - 2 * s.margin &&
    Math.min(s.width / grid.columns, s.height / grid.rows) >=
      Math.max(30, frameWidth ? frameWidth + 24 : 30);
  const boundsValid = validBounds(s.bounds);
  const selectedArea = selectionAreaKm2(s.bounds);
  const outsideMarkers = s.markers.some(m => !insideBounds(m.lon,m.lat,s.bounds));

  const geometryStale = !!model && (
    model.model.geometry_revision !== "map-formats-v13" ||
    (model.settings.map_format === "artwork" && model.settings.frame_mode === "separate" && model.model.frame_fit?.assembly !== "chamfered-insert")
  );
  const stale = !!model && (
    geometryStale ||
    (s.multicolour && model.model.colour_method !== "surface-core-v1") ||
    !sameDesign(model.settings, s) ||
    (s.terrain_style === "terraced" && model.model.terrain_method !== "contour-bands") ||
    (s.buildings && s.building_style === "realistic" && model.model.city_method !== "mapped-parts-roofs-v1")
  );
  const ready = !!model && !stale && !busy;
  const failedModel = job?.status === "failed";
  const technicalFailure = failedModel && /solid mesh|watertight|material.*STL|STL.*validation|disconnected geometry/i.test(job.message);
  const canGenerate = validationIssues.length === 0;
  const active = steps[step];
  const mapSettings=activeMapSettings(s);

  function changeSettings(values: Partial<Settings>) {
    const next = { ...s, ...values };
    // Store dimensions and their new crop together so undo/redo restores both.
    if (mapRatioLocked && artworkRatio(next) !== artworkRatio(s)) {
      patch({ ...values, bounds: fitArtworkBounds(next.bounds, artworkRatio(next)) });
    } else patch(values);
  }

  function go(next: number) {
    if (busy) return;
    if (next !== 0) clearPlaceSearch();
    setHome(false);
    setStep(next);
    setPlacingMarker(null);
    if (next === 0) setView("map");
    else if (next === MAKE_STEP) setView(model ? "3d" : "layout");
    else if (view === "trace") setView(model ? "3d" : "map");
    requestAnimationFrame(() => {
      panel.current?.scrollTo({ top: 0 });
      stepHeading.current?.focus({ preventScroll: true });
    });
  }
  function clearPlaceSearch() {
    searchVersion.current++;
    setSearching(false);
    setSearched(false);
    setSearchResults([]);
    setQuery("");
  }
  function reviewSettings(issue: string) {
    const heading = /collection|jigsaw|puzzle|piece count/i.test(issue) ? "Size & layout" : /magnet|mount|frame|bevel|corner|caption/i.test(issue) ? "Frame & caption"
      : /trail|route/.test(issue) ? "Trails"
      : /special place|location pin|marker/i.test(issue) ? "Special places"
      : /colour|material/i.test(issue) ? "Print colours"
      : /base|smoothing|exaggeration|terrain|contour|facet|resolution/i.test(issue) ? "Land contours"
      : /water|road|building|forest|tree|field/i.test(issue) ? "Map features"
      : /tile|row|column|seam|layout/i.test(issue) ? (s.map_format==="artwork"?"Tile layout":"Holder plate layout")
      : /printer|nozzle|margin/i.test(issue) ? "Your printer"
      : "Name & exact coordinates";
    go(["Tile layout", "Holder plate layout", "Your printer"].includes(heading) ? MAKE_STEP : ["Name & exact coordinates", "Size & layout"].includes(heading) ? 0 : 1);
    requestAnimationFrame(() => {
      const summary = Array.from(panel.current?.querySelectorAll<HTMLElement>(".section > summary") ?? [])
        .find(element => element.querySelector(".section-label > span")?.textContent?.startsWith(heading));
      if (heading === "Frame & caption" || heading === "Print colours") { revealSettingsGroup(heading); return; }
      if (heading === "Map features") {
        const featureName = /forest|tree/i.test(issue) ? "Trees & woodland" : /field/i.test(issue) ? "Field effects" : /water/i.test(issue) ? "Rivers & water" : /road/i.test(issue) ? "Roads" : "Buildings";
        revealSettingsGroup(featureName); return;
      }
      const section = summary?.parentElement as HTMLDetailsElement | undefined;
      if (!section || !summary) return;
      section.open = true;
      if (/forest|tree|field/i.test(issue)) section.querySelectorAll<HTMLDetailsElement>(".section").forEach(detail => { detail.open = true; });
      // Reveal the precise controls as well when a relationship needs fixing.
      section.querySelectorAll<HTMLDetailsElement>(".advanced").forEach(detail => { detail.open = true; });
      summary.focus({ preventScroll: true });
      summary.scrollIntoView({ block: "nearest" });
    });
  }
  function revealSettingsGroup(heading: string) {
    go(heading === "Size & layout" ? 0 : 1);
    requestAnimationFrame(() => {
      const feature = Array.from(panel.current?.querySelectorAll<HTMLElement>(".feature-group") ?? []).find(group => group.dataset.feature === heading);
      if (feature) { const button = feature.querySelector<HTMLButtonElement>(".feature-details-button"); if (button?.getAttribute("aria-expanded") === "false") button.click(); button?.focus({ preventScroll: true }); feature.scrollIntoView({ block: "nearest" }); return; }
      const details = Array.from(panel.current?.querySelectorAll<HTMLDetailsElement>("details.section") ?? []).find(detail => detail.querySelector(".section-label > span")?.textContent === heading);
      if (details) { details.open = true; details.querySelector("summary")?.focus({ preventScroll: true }); details.scrollIntoView({ block: "nearest" }); }
    });
  }
  function rememberDesign() {
    if (!hasDraft) return;
    try { setDesigns(saveDesign({ id: designId.current, updated: new Date().toISOString(), settings: s, jobId: job?.id, step, view, mapRatioLocked })); }
    catch { setDraftStatus("Storage is full. Export your design to keep a copy."); }
  }
  function showChooser(mode: "new" | "change") { setChooserMode(mode); setChooserSession(value => value + 1); chooserDialog.current?.showModal(); }
  function chooseProjectType(type: ProjectType, content: WallContent) {
    if (chooserMode === "change") { changeSettings(configureProject(s, type, content)); go(0); }
    else if (defaultsRef.current) {
      rememberDesign();
      const defaults = { ...defaultsRef.current, printer_width: s.printer_width, printer_height: s.printer_height, printer_z: s.printer_z, nozzle: s.nozzle, margin: s.margin };
      const next = { ...defaults, ...configureProject(defaults, type, content, true) };
      designId.current = crypto.randomUUID();
      resetSettings(next); setJob(null); setSelected(null); setError(""); setHasDraft(true); setMapRatioLocked(true); go(0);
    }
    chooserDialog.current?.close();
  }
  async function openDesign(design: SavedDesign, print = false) {
    if (!defaultsRef.current || busy || opening) return;
    const restored = restoreDraft(design.settings, defaultsRef.current);
    if (!restored) { setError("This saved design could not be restored. Import its exported design file instead."); setHome(false); return; }
    rememberDesign(); setOpening(design.id);
    const savedJob = design.jobId ? await api<Job>("/jobs/" + encodeURIComponent(design.jobId)).catch(() => null) : null;
    designId.current = design.id; resetSettings(restored); setJob(savedJob?.result ? { ...savedJob, result: { ...savedJob.result, settings: { ...defaultsRef.current!, ...savedJob.result.settings, building_source: savedJob.result.settings.building_source ?? "osm", markers: savedJob.result.settings.markers ?? [] } } } : savedJob); setError(""); setSelected(null); clearPlaceSearch(); setHasDraft(true); setHome(false); setPlacingMarker(null);
    setStep(print ? MAKE_STEP : Number.isInteger(design.step) && design.step >= 0 && design.step <= MAKE_STEP ? design.step : 1);
    setView(["map", "layout", "3d", "trace"].includes(design.view) ? design.view as View : "map"); setMapRatioLocked(design.mapRatioLocked !== false); setOpening(null);
  }
  async function search(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setSearched(false);
    setError("");
    const version = ++searchVersion.current;
    try {
      const results = await api<SearchResult[]>(
          "/search?q=" + encodeURIComponent(query.trim()),
        );
      if (version !== searchVersion.current) return;
      setSearchResults(results);
      setSearched(true);
    } catch (e) {
      if (version === searchVersion.current) setError((e as Error).message);
    } finally {
      if (version === searchVersion.current) setSearching(false);
    }
  }
  function choosePlace(result: SearchResult) {
    const lon = Number(result.lon),
      lat = Number(result.lat),
      validLocation = Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon)<=180 && Math.abs(lat)<=90;
    if (!validLocation) { setError("The location provider returned invalid coordinates."); return; }
    const ratio = artworkRatio(activeMapSettings(s));

    patch({
      name: result.display_name.split(",")[0].slice(0, 64),
      bounds: placeBounds(lon,lat,ratio),
    });
    clearPlaceSearch();
    setView("map");
  }
  async function generate(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy || !canGenerate) return;
    if (hostedWorkspace) { helpDialog.current?.showModal(); return; }
    setError("");
    setStarting(true);
    clearPlaceSearch();
    setPlacingMarker(null);
    setConnectionError(false);
    try {
      const normalized = await api<Settings>("/validate", s);
      setSettings(normalized);
      const created = await api<{ id: string }>("/generate", normalized);
      setJob({
        id: created.id,
        status: "queued",
        progress: 0,
        message: "Preparing geographic data",
        settings: normalized,
      });
      setSelected(null);
      setView("3d");
      setStep(MAKE_STEP);
    } catch (e) {
      // Another tab may have started a job after this page was opened.
      if (e instanceof ApiError && e.status === 409) {
        try {
          const active = await api<Job | null>("/active-job");
          if (active?.settings) {
            setSettings({ ...active.settings, markers: active.settings.markers ?? [] });
            setJob(active);
            setSelected(null);
            setView("3d");
            setStep(MAKE_STEP);
            return;
          }
        } catch {
          // Keep the original error if reconnecting is unavailable.
        }
      }
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }
  async function openProject(id: string, print = false) {
    if (busy || opening) return;
    setOpening(id);
    setProjectsError("");
    try {
      const [next, defaults] = await Promise.all([
        api<Job>("/jobs/" + id),
        api<Settings>("/preset"),
      ]);
      if (!next.result)
        throw new Error("This project is not ready to open yet.");
      const normalized = {
        ...defaults,
        ...next.result.settings,
        markers: next.result.settings.markers ?? [],
      };
      // Old meshes used OSM alone. Keep that provenance so opening one offers
      // an update to the new default instead of labelling the old mesh current.
      setJob({
        ...next,
        result: {
          ...next.result,
          settings: {
            ...normalized,
            building_source: next.result.settings.building_source ?? "osm",
          },
        },
      });
      rememberDesign();
      resetSettings(normalized);
      clearPlaceSearch();
      setError("");
      setSelected(null);
      setPlacingMarker(null);
      designId.current = "generated-" + id;
      setHasDraft(true);
      setHome(false);
      setStep(print ? MAKE_STEP : 1);
      setView("3d");

    } catch (e) {
      setProjectsError("Could not open this artwork: " + (e as Error).message);
    } finally {
      setOpening(null);
    }
  }
  function saveSettings() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(s, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "contour-settings.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importSettings(file: File) {
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Choose a settings JSON smaller than 10 MB.");
      const parsed = JSON.parse(await file.text());
      const validated = await api<Settings>("/validate", parsed);
      rememberDesign();
      resetSettings(validated);
      setError("");
      designId.current = crypto.randomUUID();
      setHasDraft(true);
      setJob(null);
      go(1);
      clearPlaceSearch();
    } catch (e) {
      setError("Could not import settings: " + (e as Error).message);
    }
  }
  async function refreshProjects() {
    setProjectsLoading(true);
    setProjectsError("");
    try { setProjects(await api<Project[]>("/projects")); }
    catch (e) { setProjectsError((e as Error).message); }
    finally { setProjectsLoading(false); }
  }
  function showProjects() {
    document.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach(dialog => dialog.close());
    rememberDesign(); setNavigation("studio"); setHome(true); void refreshProjects();
  }
  const minutes = Math.floor(elapsed / 60),
    seconds = elapsed % 60;
  return (
    <div className="app-shell">
      <nav className="app-navigation" aria-label="Main navigation">
        <button className={`app-nav-item${home ? " active" : ""}`} aria-label="Projects home" aria-current={home ? "page" : undefined} title="Projects" disabled={busy} onClick={showProjects}><BrandMark size={30} /><span>Projects</span></button>
        <button className={`app-nav-item${!home ? " active" : ""}`} aria-label="Current project" aria-current={!home ? "page" : undefined} title={hasDraft ? s.name : "Create a project first"} disabled={!hasDraft || !!opening} onClick={() => { document.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach(dialog => dialog.close()); setHome(false); }}><Map size={23} /><span>Current<br />project</span></button>
        <button ref={helpButton} className={`app-nav-item app-nav-help${navigation === "help" ? " active" : ""}`} aria-label="Help" aria-haspopup="dialog" onClick={() => { setNavigation("help"); helpDialog.current?.showModal(); }}><CircleHelp size={23} /><span>Help</span></button>
        <button ref={settingsButton} className={`app-nav-item${navigation === "settings" ? " active" : ""}`} aria-label="Settings" aria-haspopup="dialog" title="Settings" onClick={() => { setNavigation("settings"); settingsDialog.current?.showModal(); }}><SettingsIcon size={23} /><span>Settings</span></button>
      </nav>
      <header className="header">
        <div className="app-brand-block">
        <a
          className="brand"
          href="#workspace"
          aria-label="Contour Studio workspace"
        >
          <span className="brand-mark">
            <BrandMark />
          </span>
          <span>
            contour<span className="brand-light"> studio</span>
          </span>
        </a>
        <button ref={creatorCredit} className="app-creator-credit" aria-label="About Louis Goldsbrough" aria-haspopup="dialog" onClick={() => creatorDialog.current?.showModal()}>by Louis Goldsbrough</button>
        </div>
        {!home && <nav className="stepper" aria-label="Edit your artwork">
          {steps.map((item, i) => (
            <button
              key={item.name}
              className={`step ${step === i ? "active" : ""} ${i < step ? "visited" : ""}`}
              aria-current={step === i ? "page" : undefined}
              disabled={busy}
              onClick={() => go(i)}
            >
              <span className="step-number">
                {i === 0 ? <MapPin size={16} /> : i === 1 ? <Palette size={16} /> : <Printer size={16} />}
              </span>
              <span>{item.name}</span>
              {i < steps.length - 1 && (
                <ChevronRight className="step-chevron" size={15} />
              )}
            </button>
          ))}
        </nav>}
        {home && <span className="start-header-note">Your free map art studio</span>}
      </header>
      {hostedWorkspace && <div className="hosting-note"><Monitor size={15} /><span>Design here. Generate and print on your computer.</span><button onClick={() => helpDialog.current?.showModal()}>How it works <ArrowRight size={14} /></button></div>}
      {home ? <ProjectStart designs={designs} projects={projects} loading={projectsLoading} error={projectsError} hasDraft={hasDraft} busy={!!busy || !!opening} onNew={() => showChooser("new")} onResume={() => setHome(false)} onOpenDesign={(design, print) => void openDesign(design, print)} onOpenProject={(id, print) => void openProject(id, print)} onRefresh={() => void refreshProjects()} onImport={() => importInput.current?.click()} /> : <>
      <div className="workspace" id="workspace" data-step={active.name.toLowerCase()}>
        <aside
          className="sidebar"
          ref={panel}
          aria-label={`${active.name} settings`}
        >
          <div className="sidebar-title">
            <span className="eyebrow">
              {projectNames[projectType(s)]} · {active.name}
            </span>
            <h1 tabIndex={-1} ref={stepHeading}>
              {active.title}
            </h1>
            <p>{active.description}</p>
          </div>
          {step === 0 && (
            <div className="place-panel">
              <TilePicker settings={s} onChange={changeSettings}/>
              <form onSubmit={search} className="location-block">
                <label className="input-label" htmlFor="location-search">
                  Search for a place
                </label>
                <div className="search-form">
                  <Search size={18} />
                  <input
                    id="location-search"
                    type="search"
                    minLength={2}
                    maxLength={160}
                    required
                    value={query}
                    disabled={busy}
                    onChange={(e) => {
                      searchVersion.current++;
                      setSearching(false);
                      setQuery(e.target.value);
                      setSearched(false);
                      setSearchResults([]);
                    }}
                    placeholder="Place or latitude, longitude"
                  />
                  <button disabled={searching || busy} aria-label="Search">
                    {searching ? (
                      <LoaderCircle size={18} className="spin" />
                    ) : (
                      <ArrowRight size={18} />
                    )}
                  </button>
                </div>
                <p className="hint search-hint">A town, postcode, or latitude and longitude.</p>
                <div className="starter-places" aria-label="Places to try">
                  <span>Try a place</span>
                  {starterPlaces.map(place => <button type="button" key={place.name} disabled={busy} onClick={() => { choosePlace({ display_name: place.name, lon: String(place.lon), lat: String(place.lat) }); setError(""); }}>{place.name}</button>)}
                </div>
              </form>
              {searched && (
                <div className="search-results" aria-label="Location results" aria-live="polite">
                  {searchResults.length ? (
                    searchResults.map((result, i) => (
                      <button key={i} disabled={busy} onClick={() => choosePlace(result)}>
                        <MapPin size={17} />
                        <span>
                          <strong>{result.display_name.split(",")[0]}</strong>
                          <small>
                            {result.display_name.split(",").slice(1).join(",")}
                          </small>
                        </span>
                        <ChevronRight size={15} />
                      </button>
                    ))
                  ) : (
                    <p role="status">
                      No places found. Add a country, enter latitude, longitude, or select the area on the map.
                    </p>
                  )}
                </div>
              )}
              <div className="current-place">
                <span className="place-icon">
                  <MapPin size={20} />
                </span>
                <div>
                  <span className="eyebrow">SELECTED PLACE</span>
                  <strong>{s.name}</strong>
                  <small>
                    {((s.bounds.north + s.bounds.south) / 2).toFixed(4)}°,{" "}
                    {centreLongitude(s.bounds).toFixed(4)}°
                  </small>
                </div>
                <Check size={17} />
              </div>
            </div>
          )}
          <form
            id="settings-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (step === MAKE_STEP) void generate();
            }}
          >
            <fieldset disabled={busy}>
              {step < MAKE_STEP ? (
                <>
                  {step === 1 && <><TilePicker settings={s} onChange={changeSettings}/><SettingsPanel section="style" settings={s} onChange={changeSettings} fits={fits} placing={null} onPlace={() => {}} /><SettingsPanel section="frame" settings={s} onChange={changeSettings} fits={fits} placing={null} onPlace={() => {}} /></>}
                  {step === 0 && <Section open heading="Size & layout" icon={<Ruler size={18}/>} description={`${displaySize(s.width)} × ${displaySize(s.height)} mm · ${projectNames[projectType(s)]}`}>
                    <SettingsPanel section="format" settings={s} onChange={changeSettings} fits={fits} placing={null} onPlace={() => {}} />
                  </Section>}
                  <SettingsPanel
                    section={step === 0 ? "location" : "details"}
                    settings={s}
                    onChange={changeSettings}
                    fits={fits}
                    placing={placingMarker}
                    onPlace={(id) => {
                      setDraftTrailPoints([]);
                      setPlacingMarker(id);
                      setView("map");
                    }}
                  />
                  {step === 0 && (
                    <>
                      <Section heading="Name & exact coordinates" icon={<MapPin size={18} />} description="Rename your artwork or enter precise bounds">
                        <Field label="Artwork name">
                          <input
                            value={s.name}
                            maxLength={64}
                            required
                            onChange={(e) => patch({ name: e.target.value })}
                          />
                        </Field>
                        <div className="two-col">
                          {(["west", "south", "east", "north"] as const).map(
                            (key) => (
                              <NumberField
                                key={key}
                                label={key[0].toUpperCase() + key.slice(1)}
                                ariaLabel={key + " coordinate"}
                                value={s.bounds[key]}
                                step="any"
                                min={
                                  key === "west" || key === "east" ? -180 : -90
                                }
                                max={
                                  key === "west" || key === "east" ? 180 : 90
                                }
                                onChange={(v) =>
                                  patch({ bounds: { ...s.bounds, [key]: v } })
                                }
                              />
                            ),
                          )}
                        </div>
                        <p className="hint">
                          Latitude and longitude. North is at the top. An east longitude smaller than west crosses the date line.
                        </p>
                      </Section>
                      {!boundsValid && (
                        <p className="inline-error">
                          Choose an area with north above south, within 2° per side and −90…90° latitude.
                        </p>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div className="make-panel">
                  <SettingsPanel section="make" settings={s} onChange={changeSettings} fits={fits} placing={null} onPlace={() => {}} />
                  <div className="review-card">
                    <span className="review-icon">
                      {ready ? <CircleCheck size={28} /> : <Layers size={28} />}
                    </span>
                    <strong>
                      {ready
                        ? "Your print pack is ready"
                        : failedModel ? "Let’s try that again."
                        : stale
                          ? "Update your print plates"
                          : "Your artwork, at a glance"}
                    </strong>
                    <p>
                      {ready
                        ? "Open every prepared plate in Bambu Studio below."
                        : stale ? "Your artwork has changed. Prepare the plates again to include your latest edits." : "Your map, frame and joining pieces will be checked and arranged on print plates."}
                    </p>
                  </div>
                  {failedModel && <div className="generation-recovery" role="status">
                    <p>Your design is saved. Review your style or try generating again.</p>
                    {s.multicolour && <><p>You can also retry in single colour with the same place and details.</p><button type="button" onClick={() => { patch({ multicolour: false }); setError(""); }}><Printer size={16} />Use single-colour printing</button></>}
                    <button type="button" onClick={() => go(1)}><Palette size={16} />Review details</button>
                    <details className="advanced"><summary>Show error details</summary><p>{job.message}</p></details>
                  </div>}
                  <div className="review-list">
                    <button type="button" onClick={() => go(0)}>
                      <MapPin size={18} />
                      <span>
                        <small>Place</small>
                        <strong>{s.name}</strong>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        revealSettingsGroup("Size & layout");
                      }}
                    >
                      <Ruler size={18} />
                      <span>
                        <small>Finished size</small>
                        <strong>
                          {displaySize(s.width)} × {displaySize(s.height)} mm · {count} {tileNoun}
                        </strong>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                    <button type="button" onClick={() => reviewSettings("terrain")}>
                      <Mountain size={18} />
                      <span>
                        <small>Landscape</small>
                        <strong>{s.map_format === "jigsaw" ? `Almost flat · ${s.puzzle_relief} mm relief` : `${s.terrain_style.charAt(0).toUpperCase() + s.terrain_style.slice(1)} · ${s.exaggeration}× height`}</strong>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                    <button type="button" onClick={() => reviewSettings("road")}>
                      <Map size={18} />
                      <span>
                        <small>Map features</small>
                        <strong>{[
                          s.roads !== "none" ? "Roads" : "",
                          s.water ? "Water" : "",
                          s.buildings ? "Buildings" : "",
                          s.forests ? "Forests" : "",
                          s.fields ? "Fields" : "",
                          s.landmarks ? "Landmarks" : "",
                          s.trails.length ? `${s.trails.length} trail${s.trails.length === 1 ? "" : "s"}` : "",
                        ].filter(Boolean).join(" · ") || "Terrain only"}</strong>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                    <button type="button" onClick={() => reviewSettings("colour")}>
                      <Printer size={18} />
                      <span>
                        <small>Print colours</small>
                        <strong>{s.multicolour ? "Multicolour print pack" : "Single colour"}</strong>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                    <button type="button" onClick={() => revealSettingsGroup("Frame & caption")}>
                      <Box size={18} />
                      <span><small>Frame</small><strong>{s.frame_mode === "none" ? "No frame" : s.frame_mode === "separate" ? "Slide-in frame" : "Built-in frame"}</strong></span>
                      <ChevronRight size={16} />
                    </button>
                    <button type="button" onClick={() => reviewSettings("marker")}>
                      <MapPin size={18} />
                      <span><small>Special places</small><strong>{s.markers.length} {s.markers.length === 1 ? "place" : "places"}</strong></span>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  {!canGenerate && (
                    <div className="inline-error" role="alert">
                      <span>{validationIssues[0]}</span>
                      {validationIssues.length > 1 && <small>{validationIssues.length - 1} more {validationIssues.length === 2 ? "setting needs" : "settings need"} attention.</small>}
                      <button
                        type="button"
                        onClick={() => reviewSettings(validationIssues[0])}
                      >
                        Review settings <ArrowRight size={15} />
                      </button>
                    </div>
                  )}
                  {hostedWorkspace && <div className="local-print-card"><Monitor size={22} /><h3>Ready to make it real?</h3><p>Save this design, then import it into the desktop workspace to generate your 3D model and print files.</p><button type="button" onClick={saveSettings}><Download size={16} />Save design</button></div>}
                  <div className="pack-includes">
                    <span className="eyebrow">IN YOUR PRINT PACK</span>
                    {[
                      "All pieces arranged on Bambu print plates",
                      "Colour assignments & required quantities",
                      "Individual STL files for other slicers",
                      "Assembly guide & saved settings",
                      ...(s.joints ? ["Joining key & fit-test pieces"] : []),
                    ].map((label) => (
                      <span key={label}>
                        <Check size={15} />
                        {label}
                      </span>
                    ))}
                  </div>
                  <p className="hint local-note">
                    {hostedWorkspace ? "Your draft stays in this browser. Export settings to take it with you." : "Generated projects are saved on this computer."}
                  </p>
                </div>
              )}
            </fieldset>
          </form>
          <Section heading="Design files" icon={<Save size={18} />} description="Save a portable copy or import a design">
          <div className="settings-files">
            <button onClick={saveSettings}>
              <Save size={15} />
              Export design
            </button>
            <button
              disabled={busy}
              onClick={() => importInput.current?.click()}
            >
              <Upload size={15} />
              Import
            </button>

          </div>
          </Section>
        </aside>
        <main className="main">
          <div className="project-heading">
            <div>
              <span className="eyebrow">YOUR ARTWORK</span>
              <h2>{s.name}</h2>
              <button className="project-type-link" disabled={busy} onClick={() => showChooser("change")}>{projectNames[projectType(s)]} · Change type <ChevronRight size={13}/></button>
              <div className="design-status"><BookmarkCheck size={13} /><span role="status">{draftStatus}</span></div>
            </div>
            <div className="workspace-actions">
              <div className="history-tools" role="group" aria-label="Design history">
                <button aria-label="Undo design change" title="Undo · Ctrl/⌘ Z" disabled={busy || !canUndo} onClick={() => { setPlacingMarker(null); undo(); }}><Undo2 size={17} /></button>
                <button aria-label="Redo design change" title="Redo · Ctrl/⌘ Shift Z" disabled={busy || !canRedo} onClick={() => { setPlacingMarker(null); redo(); }}><Redo2 size={17} /></button>
              </div>
            <div
              className="view-switch"
              role="group"
              aria-label="Workspace view"
            >
              {(
                [
                  ["map", Map, "Map"],
                  ["trace", Plus, "Add missing details"],
                  ["layout", Ruler, "Artwork layout"],
                  ["3d", Box, "3D preview"],
                ] as const
              ).map(([name, Icon, label]) => (
                <button
                  key={name}
                  disabled={name === "trace" && busy}
                  aria-pressed={view === name}
                  className={view === name ? "active" : ""}
                  onClick={() => {
                    setView(name);
                    if (name !== "map") setPlacingMarker(null);
                  }}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            </div>
          </div>
          {error && (
            <div className="alert" role="alert">
              <TriangleAlert size={18} />
              <span>{technicalFailure && error === job.message ? "We couldn’t generate this model. Your design is saved; recovery options are in Print." : error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={17} />
              </button>
            </div>
          )}
          {boundsValid && selectedArea > MAX_BUILDING_AREA_KM2 && (
            <div className="stale-note" role="status">
              <TriangleAlert size={18} />
              <span><strong>Large area · {selectedArea.toLocaleString("en-GB", { maximumFractionDigits: 1 })} km²</strong><br />
                Mapped building detail will not be shown above {MAX_BUILDING_AREA_KM2} km². Reduce your selection to include buildings. If this area is too large for mapped landscape detail or the map service is unavailable, generation continues with real terrain and lists the omitted detail in the finished model.
              </span>
            </div>
          )}
          {stale && view === "3d" && (
            <div className="stale-note">
              <TriangleAlert size={16} />
              <span>
                {geometryStale
                  ? "Updated printable geometry is available. Rebuild this model to apply it."
                  : "Changes haven’t been built yet. This preview uses your last generated settings."}
              </span>
              {step !== MAKE_STEP && (
                <button onClick={() => go(MAKE_STEP)}>
                  Update model <ArrowRight size={15} />
                </button>
              )}
            </div>
          )}
          {placingMarker && (
            <div className="placement-note" role="status">
              <MapPin size={18} />
              <span>{placingMarker.startsWith("trail:")?placingMarker==="trail:new"?`${draftTrailPoints.length} points selected. Click at least two points to start a trail.`:"Click inside the map to extend your trail. Finish drawing in Trails, or press Escape.":"Click inside the selected area to place your symbol."}</span>
              <button onClick={() => setPlacingMarker(null)}>Cancel</button>
            </div>
          )}
          {step !== MAKE_STEP && <div className="edit-shortcuts" role="group" aria-label="Quick edit"><button disabled={busy} onClick={() => go(0)}><MapPin size={15}/>Place</button><button disabled={busy} onClick={() => { revealSettingsGroup("Size & layout"); }}><Ruler size={15}/>Size & layout</button><button disabled={busy} onClick={() => revealSettingsGroup("Frame & caption")}><Box size={15}/>Frame</button><button disabled={busy} onClick={() => revealSettingsGroup("Print colours")}><Palette size={15}/>Colours</button></div>}
          <div className="canvas-wrap">
            <WorkspaceBoundary key={view}>
            <Suspense
              fallback={
                <div className="empty-preview">
                  <LoaderCircle className="spin" size={28} />
                  <p>Opening the workspace…</p>
                </div>
              }
            >
              {view === "trace" ? (
                <TraceEditor settings={mapSettings} onChange={patch} disabled={busy} onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo} />
              ) : view === "map" ? (
                <MapView
                  settings={mapSettings}
                  ratioLocked={mapRatioLocked}
                  onRatioLockedChange={setMapRatioLocked}
                  editable={!busy && step === 0}
                  onBounds={(bounds) => {
                    if (!busy && step === 0) patch({ bounds });
                  }}
                  placingMarker={busy ? null : placingMarker}
                  onPlaceMarker={(lon, lat) => {
                    if(placingMarker?.startsWith('trail:')) {
                      const id=placingMarker.slice(6);
                      if(id==='new') {
                        const points=[...draftTrailPoints,[lon,lat] as [number,number]];
                        if(points.length<2){setDraftTrailPoints(points);return;}
                        if(points[0][0]===lon&&points[0][1]===lat)return;
                        const trailId=crypto.randomUUID();
                        patch({trails:[...s.trails,{id:trailId,name:'Drawn trail',points,style:'raised',width:1.6,height:.8}]});
                        setDraftTrailPoints([]);setPlacingMarker('trail:'+trailId);return;
                      }
                      patch({trails:s.trails.map(t=>t.id===id?{...t,points:[...t.points,[lon,lat] as [number,number]]}:t)});
                      return;
                    }
                    if (!busy)
                      patch({
                        markers: s.markers.map((m) =>
                          m.id === placingMarker ? { ...m, lon, lat } : m,
                        ),
                      });
                    setPlacingMarker(null);
                  }}
                  onCancelMarker={() => setPlacingMarker(null)}
                />
              ) : view === "layout" ? (
                collection(s) ? <CollectionLayout settings={s} onGrow={direction=>changeSettings(direction === "column" ? {collection_columns:s.collection_columns+1} : {collection_rows:s.collection_rows+1})} onTile={i=>{const t=s.map_tiles[i];patch({active_tile:i,name:t.name,bounds:t.bounds,markers:t.markers,trails:t.trails,custom_buildings:t.custom_buildings??[],reference_image:t.reference_image??null});go(0);}}/> : s.map_format==="jigsaw" ? <PuzzleLayout settings={s}/> : <LayoutView settings={s} fits={fits} />
              ) : model && job ? (
                <Preview
                  id={job.id}
                  model={model}
                  settings={s}
                  selected={selected}
                  onSelect={setSelected}
                  inspect={step === MAKE_STEP}
                />
              ) : (
                <div className={`empty-preview ${busy ? "generating" : ""}`}>
                  <span className="empty-icon">
                    {busy ? (
                      <LoaderCircle className="spin" size={34} />
                    ) : (
                      <Mountain size={38} strokeWidth={1.3} />
                    )}
                  </span>
                  <span className="eyebrow">
                    {busy ? "MAKING YOUR ARTWORK" : "FROM PLACE TO OBJECT"}
                  </span>
                  <h3>
                    {busy
                      ? "Building your little piece of the world."
                      : job?.status === "failed"
                        ? "Let’s give that another try."
                        : "Your place, in another dimension."}
                  </h3>
                  <p>
                    {busy
                      ? job?.message || "Starting your model…"
                      : job?.status === "failed"
                        ? "Your settings are still here. Review the message above, then try generating again."
                        : "Your 3D preview will appear here after you generate the model."}
                  </p>
                  {busy ? (
                    <div className="generation-progress" role="status">
                      <progress aria-label="Model generation" max={100} value={job?.progress ?? 0} />
                      <span>
                        {job?.progress ?? 0}% ·{" "}
                        {minutes > 0 ? `${minutes}m ` : ""}
                        {seconds}s elapsed
                      </span>
                      <small>
                        {connectionError
                          ? "Connection interrupted. Reconnecting to your running job…"
                          : "Larger areas can take a few minutes."}
                      </small>
                    </div>
                  ) : step !== MAKE_STEP ? (
                    <button onClick={() => go(MAKE_STEP)}>
                      Prepare to print
                      <ArrowRight size={16} />
                    </button>
                  ) : null}
                </div>
              )}
            </Suspense>
            </WorkspaceBoundary>
            <div className="canvas-caption">
              <span>
                <span className="dot" />
                {view === "trace"
                  ? `Tracing view · ${s.custom_buildings?.length ?? 0} added buildings`
                  : view === "map"
                  ? step === 0
                    ? "Adjust your selected area"
                    : "Selected area"
                  : view === "layout"
                    ? "Finished artwork · front view"
                    : model
                      ? `Generated model · ${(model.model.features.buildings ?? 0).toLocaleString()} buildings`
                      : "3D workspace"}
              </span>
              <span>
                {view === "3d" && model
                  ? `${displaySize(model.settings.width)} × ${displaySize(model.settings.height)}`
                  : `${displaySize(s.width)} × ${displaySize(s.height)}`}{" "}
                mm <span className="caption-divider">/</span>{" "}
                {view === "3d" && model
                  ? model.layout.columns * model.layout.rows
                  : count}{" "}
                {view === "3d" && model
                  ? model.settings.map_format==="jigsaw" ? "pieces" : collection(model.settings) ? "maps" : model.layout.columns * model.layout.rows === 1
                    ? "tile"
                    : "tiles"
                  : tileNoun}
              </span>
            </div>
          </div>
          {step === MAKE_STEP && model && job && (
            <PrintPackage
              ref={printPackage}
              jobId={job.id}
              model={model}
              selected={selected}
              onSelect={(id) => {
                setSelected(id);
                setView("3d");
                document
                  .querySelector(".canvas-wrap")
                  ?.scrollIntoView({ block: "nearest" });
              }}
              stale={stale}
            />
          )}
          {step !== MAKE_STEP && (
            <div className="workspace-note">
              <span>
                {view === "trace"
                  ? "Added buildings are saved with your design and included when you generate the model."
                  : step === 1
                  ? "Finished size includes the frame. The layout updates as you change your design."
                  : step === 0 ? "Move or resize the selection to choose your map area."
                  : "Detail changes are applied when you generate your model."}
              </span>
              <span className="north-note"><ArrowRight size={13} style={{ transform: "rotate(-90deg)" }} aria-hidden="true" />North up</span>
            </div>
          )}
        </main>
      </div>
      <footer className="workflow-footer">
        <div className="footer-summary">
          <span className="footer-icon">
            {busy ? (
              <LoaderCircle className="spin" size={21} />
            ) : ready ? (
              <CircleCheck size={21} />
            ) : (
              <Layers size={21} />
            )}
          </span>
          <div>
            <strong>
              {busy
                ? connectionError
                  ? "Reconnecting to your model…"
                  : job?.message || "Starting your model…"
                : step === MAKE_STEP && ready
                  ? "Mesh checked · Print pack ready"
                  : `${displaySize(s.width)} × ${displaySize(s.height)} mm`}
            </strong>
            <span>
              {busy
                ? `${job?.progress ?? 0}% complete · Keep this window open`
                : `${count} ${tileNoun} · ${fits ? "Fits your build plate" : "Check your tile layout"}${validationIssues.length && fits ? " · Review settings" : ""}${stale ? " · Changes not built yet" : ""}`}
            </span>
          </div>
        </div>
        <div className="footer-actions">
          {step > 0 && (
            <button
              className="back-button"
              disabled={busy}
              onClick={() => go(step - 1)}
            >
              <ArrowLeft size={17} />
              Back
            </button>
          )}
          {step === MAKE_STEP && ready && job ? (
            <button className="primary" onClick={() => { document.querySelector(".print-package")?.scrollIntoView({ block: "start", behavior: "smooth" }); printPackage.current?.open(); }}><Printer size={18}/>Open in Bambu Studio</button>
          ) : (
            <button
              className="primary"
              disabled={
                busy ||
                (step === MAKE_STEP && !canGenerate) ||
                (step === 0 && (!boundsValid || !s.name.trim()))
              }
              onClick={() => {
                if (step === MAKE_STEP) void generate();
                else {
                  const form =
                    document.querySelector<HTMLFormElement>("#settings-form");
                  if (!form || form.reportValidity()) go(step + 1);
                }
              }}
            >
              {busy ? <LoaderCircle className="spin" size={18} /> : null}
              {busy
                ? "Preparing your artwork…"
                : step === MAKE_STEP && stale
                  ? "Update print plates"
                  : step === MAKE_STEP && job?.status === "failed"
                    ? "Try generating again"
                    : step === MAKE_STEP && hostedWorkspace
                      ? "Continue to local printing"
                      : active.next}
              {!busy && <ArrowRight size={17} />}
            </button>
          )}
        </div>
      </footer>
      </>}
      <input ref={importInput} type="file" hidden accept="application/json,.json" onChange={event => { if (event.target.files?.[0]) void importSettings(event.target.files[0]); event.target.value = ""; }} />
      <dialog ref={chooserDialog} className="project-chooser-dialog" aria-labelledby="project-chooser-title" onClick={event => { if (event.target === event.currentTarget) chooserDialog.current?.close(); }}>
        <div className="panel-heading"><div><span className="eyebrow">{chooserMode === "new" ? "START SOMETHING PERSONAL" : "YOUR PROJECT, YOUR WAY"}</span><h2 id="project-chooser-title">{chooserMode === "new" ? "What would you like to make?" : "Change project type"}</h2></div><button aria-label="Close project chooser" onClick={() => chooserDialog.current?.close()}><X size={20}/></button></div>
        <ProjectChooser key={chooserSession} initialContent={collection(s) ? "places" : "continuous"} current={chooserMode === "change" ? projectType(s) : undefined} onCancel={() => chooserDialog.current?.close()} onChoose={chooseProjectType}/>
      </dialog>
      <dialog ref={creatorDialog} className="help-dialog creator-dialog" aria-labelledby="creator-dialog-title" onClose={() => creatorCredit.current?.focus()} onClick={e => { if (e.target === e.currentTarget) creatorDialog.current?.close(); }}>
        <div className="panel-heading"><h2 id="creator-dialog-title">Meet the maker</h2><button aria-label="Close about Louis" onClick={() => creatorDialog.current?.close()}><X size={20} /></button></div>
        <Creator headingId="app-creator-title" compact />
      </dialog>
      <dialog ref={helpDialog} onClose={() => { setNavigation("studio"); helpButton.current?.focus(); }} className="help-dialog" aria-labelledby="help-title" onClick={e => { if (e.target === e.currentTarget) helpDialog.current?.close(); }}>
        <div className="panel-heading"><div><span className="eyebrow">A LITTLE PIECE OF THE WORLD</span><h2 id="help-title">From map to mantelpiece.</h2></div><button aria-label="Close help" onClick={() => helpDialog.current?.close()}><X size={20} /></button></div>
        <p className="help-intro">Choose somewhere that means something to you. Turn its landscape into an artwork you can hold.</p>
        <ol className="help-steps">
          <li><MapPin size={22}/><div><strong>Choose a project and a place</strong><p>Start with a single map, modular wall or jigsaw. Choose your location, size and layout together on the map.</p></div></li>
          <li><Palette size={22}/><div><strong>Make it yours</strong><p>Choose a style, frame and colours. Toggle features, expand their details and use Undo whenever you need it.</p></div></li>
          <li><Printer size={22}/><div><strong>Prepare every piece</strong><p>Choose your printer and prepare your artwork. Open all pieces on arranged plates in Bambu Studio, confirm your printer and filaments, then slice.</p></div></li>
        </ol>
        {hostedWorkspace && <p className="help-install">Download Contour Studio for macOS or Windows, then import your saved settings. The desktop app includes its generation engine. <a href="./#downloads">Get the free desktop app</a>.</p>}
        <div className="help-actions"><button className="primary" onClick={saveSettings}><Download size={17} />Save settings</button>{hostedWorkspace && <a href="http://127.0.0.1:8767" target="_blank" rel="noreferrer">Open local workspace <ExternalLink size={15} /></a>}</div>
        <p className="hint">No account needed. Drafts stay in your browser; generated models stay on your computer.</p>
        <section className="help-support" aria-labelledby="support-title">
          <h3 id="support-title">Free to make it your own.</h3>
          <p>Contour Studio is completely free and open source under the MIT licence. Use, modify, share or sell the software; keep its copyright and licence notice. Map data and libraries retain their own licences.</p>
          <div className="help-support-links"><a href={repository} target="_blank" rel="noopener noreferrer"><Github size={17} />Public GitHub repository</a><a href={releaseUrl} target="_blank" rel="noopener noreferrer">Downloads & release notes</a></div>
          <p>If you’ve enjoyed using it, you can buy me a coffee as a thanks. It’s entirely optional; every feature stays free.</p>
          <CoffeeLink />
        </section>
        <button className="help-creator-link" onClick={() => { helpDialog.current?.close(); creatorDialog.current?.showModal(); }}>Meet Louis, the maker of Contour Studio<ArrowRight size={17} aria-hidden="true" /></button>
      </dialog>
      <dialog ref={settingsDialog} className="help-dialog app-settings-dialog" aria-labelledby="app-settings-title" onClose={() => { setNavigation("studio"); settingsButton.current?.focus(); }} onClick={event => { if (event.target === event.currentTarget) settingsDialog.current?.close(); }}>
        <div className="panel-heading"><h2 id="app-settings-title">Settings</h2><button aria-label="Close settings" onClick={() => settingsDialog.current?.close()}><X size={20} /></button></div>
        <section className="app-settings-section"><h3>App updates</h3><AppUpdates busy={!!busy} /><p className="hint">{hostedWorkspace ? "The browser workspace updates automatically. Get the latest desktop app from the release page." : "Check for the latest version of Contour Studio for your computer."}</p><a href={releaseUrl} target="_blank" rel="noopener noreferrer">Downloads & release notes <ExternalLink size={14} /></a></section>
        <section className="app-settings-section"><h3>Help & support</h3><button onClick={() => { settingsDialog.current?.close(); helpDialog.current?.showModal(); }}><CircleHelp size={18} />How it works</button><CoffeeLink className="app-coffee-link" /></section>
      </dialog>

    </div>
  );
}
