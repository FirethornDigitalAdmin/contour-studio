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
} from "lucide-react";
import CoffeeLink from "./CoffeeLink";
import { repository, releaseUrl } from "./distribution";
import { api, hostedWorkspace, starterPlaces } from "./hosted";
import { ApiError, layout, type Settings, type Job } from "./types";
import { Field, NumberField, Section } from "./Controls";
import SettingsPanel from "./SettingsPanel";
import LayoutView from "./LayoutView";
import PrintPackage from "./PrintPackage";
import WorkspaceBoundary from "./WorkspaceBoundary";
import useDesignHistory from "./useDesignHistory";
import { restoreDraft, sameDesign, validateDesign } from "./validation";
import { validBounds, insideBounds, centreLongitude, placeBounds, artworkRatio, fitArtworkBounds } from "./world";
const MapView = lazy(() => import("./MapView"));
const Preview = lazy(() => import("./Preview"));

const steps = [
  {
    name: "Place & size",
    title: "Choose your place.",
    description: "Choose your place and finished artwork size together.",
    next: "Make it yours",
  },
  {
    name: "Style",
    title: "Make it yours.",
    description: "Pick a style. Make it yours.",
    next: "Review & make",
  },
  {
    name: "Make",
    title: "Make your artwork.",
    description: "Build your model, take a look, then download your files.",
    next: "Generate model",
  },
];
type Project = {
  id: string;
  name: string;
  created_at: string;
  layout: { columns: number; rows: number };
  width?: number;
  height?: number;
  terrain_style?: string;
};
type SearchResult = { display_name: string; lon: string; lat: string };
type View = "map" | "layout" | "3d";

export default function App() {
  const { settings, setSettings, patch, undo, redo, canUndo, canRedo } = useDesignHistory();
  const [job, setJob] = useState<Job | null>(null);
  const [step, setStep] = useState(0);
  const [view, setView] = useState<View>("map");
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
  const [placingMarker, setPlacingMarker] = useState<string | null>(null);
  const [mapRatioLocked, setMapRatioLocked] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [draftStatus, setDraftStatus] = useState("Draft saved on this device");
  const [projectQuery, setProjectQuery] = useState("");
  const [projectSort, setProjectSort] = useState("newest");
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState("");
  const defaultsRef = useRef<Settings | null>(null);
  const searchVersion = useRef(0);
  const draftSnapshot = useRef<string | null>(null);
  draftSnapshot.current = settings ? JSON.stringify({ version: 1, settings, jobId: job?.id, step, view, mapRatioLocked }) : null;
  const helpDialog = useRef<HTMLDialogElement>(null);
  const projectDialog = useRef<HTMLDialogElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLElement>(null);
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
              const savedSettings = restoreDraft(draft.settings, defaults);
              if (!savedSettings) throw new Error("Invalid draft");
              restored = savedSettings;
              if (draft.jobId) savedJob = await api<Job>("/jobs/" + encodeURIComponent(draft.jobId)).catch(() => null);
              if (savedJob?.result) savedJob = { ...savedJob, result: { ...savedJob.result, settings: { ...defaults, ...savedJob.result.settings, building_source: savedJob.result.settings.building_source ?? "osm", markers: savedJob.result.settings.markers ?? [] } } };
              if (!alive) return;
              setStep([0, 1, 2].includes(draft.step) ? draft.step : 0);
              setView(["map", "layout", "3d"].includes(draft.view) ? draft.view : "map");
              setMapRatioLocked(draft.mapRatioLocked !== false);
              setDraftStatus("Your last design was restored");
            }
          } catch { setDraftStatus("A saved draft could not be restored. Your completed projects are available."); }
        }
        if (!alive) return;
        setSettings({ ...restored, markers: restored.markers ?? [] });
        if (active) {
          setJob(active);
          setStep(2);
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
    if (!settings) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("contour-studio.draft.v1", JSON.stringify({ version: 1, settings, jobId: job?.id, step, view, mapRatioLocked }));
        setDraftStatus("Draft saved on this device");
      } catch { setDraftStatus("Draft saving unavailable · Save settings to keep a copy"); }
    }, 350);
    return () => clearTimeout(timer);
  }, [settings, job?.id, step, view, mapRatioLocked]);
  useEffect(() => {
    const flush = () => {
      if (!draftSnapshot.current) return;
      try { localStorage.setItem("contour-studio.draft.v1", draftSnapshot.current); } catch { /* Keep exported settings available if browser storage is full. */ }
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => { window.removeEventListener("pagehide", flush); window.removeEventListener("beforeunload", flush); };
  }, []);
  useEffect(() => {
    if (placingMarker && !settings?.markers.some((marker) => marker.id === placingMarker)) setPlacingMarker(null);
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
          setStep(2);
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
  const count = grid.columns * grid.rows;
  const tileNoun = count === 1 ? "tile" : "tiles";
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
  const outsideMarkers = s.markers.some(m => !insideBounds(m.lon,m.lat,s.bounds));

  const geometryStale = !!model && (
    model.model.geometry_revision !== "supported-edges-frame-lip-v3" ||
    (model.settings.frame_mode === "separate" && model.model.frame_fit?.assembly !== "chamfered-insert")
  );
  const stale = !!model && (
    geometryStale ||
    !sameDesign(model.settings, s) ||
    (s.terrain_style === "terraced" && model.model.terrain_method !== "contour-bands") ||
    (s.buildings && s.building_style === "realistic" && model.model.city_method !== "mapped-parts-roofs-v1")
  );
  const ready = !!model && !stale && !busy;
  const failedModel = job?.status === "failed";
  const technicalFailure = failedModel && /solid mesh|watertight|material.*STL|STL.*validation|disconnected geometry/i.test(job.message);
  const canGenerate = validationIssues.length === 0;
  const active = steps[step];

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
    setStep(next);
    setPlacingMarker(null);
    setView(next === 0 ? "map" : next === 2 || model ? "3d" : "map");
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
    const heading = /frame|bevel|corner|caption/i.test(issue) ? "Frame & caption"
      : /special place|location pin|marker/i.test(issue) ? "Special places"
      : /colour|material/i.test(issue) ? "Print colours"
      : /base|smoothing|exaggeration|terrain|contour|facet|resolution/i.test(issue) ? "Land contours"
      : /water|road|building|forest|tree|field/i.test(issue) ? "Map features"
      : /tile|row|column|seam|layout/i.test(issue) ? "Tile layout"
      : /printer|nozzle|margin/i.test(issue) ? "Your printer"
      : "Name & exact coordinates";
    go(["Tile layout", "Your printer", "Name & exact coordinates"].includes(heading) ? 0 : 1);
    requestAnimationFrame(() => {
      const summary = Array.from(panel.current?.querySelectorAll<HTMLElement>(".section > summary") ?? [])
        .find(element => element.querySelector(".section-label > span")?.textContent?.startsWith(heading));
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
    const ratio = (s.width - 2 * frameWidth) / (s.height - 2 * frameWidth);

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
      setStep(2);
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
            setStep(2);
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
  async function openProject(id: string) {
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
      setSettings(normalized);
      clearPlaceSearch();
      setError("");
      setSelected(null);
      setPlacingMarker(null);
      setStep(2);
      setView("3d");
      projectDialog.current?.close();
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
      if (file.size > 1024 * 1024) throw new Error("Choose a settings JSON smaller than 1 MB.");
      const parsed = JSON.parse(await file.text());
      const validated = await api<Settings>("/validate", parsed);
      setSettings(validated);
      setError("");
      go(0);
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
  const filteredProjects = projects.filter((p) => p.name.toLowerCase().includes(projectQuery.toLowerCase())).sort((a, b) => projectSort === "name" ? a.name.localeCompare(b.name) : projectSort === "oldest" ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at));
  const minutes = Math.floor(elapsed / 60),
    seconds = elapsed % 60;
  return (
    <div className="app-shell">
      <header className="header">
        <a
          className="brand"
          href="#workspace"
          aria-label="Contour Studio workspace"
        >
          <span className="brand-mark">
            <Layers size={22} />
          </span>
          <span>
            contour<span className="brand-light"> studio</span>
          </span>
        </a>
        <nav className="stepper" aria-label="Create your artwork">
          {steps.map((item, i) => (
            <button
              key={item.name}
              className={`step ${step === i ? "active" : ""} ${i < step ? "visited" : ""}`}
              aria-current={step === i ? "step" : undefined}
              disabled={busy}
              onClick={() => go(i)}
            >
              <span className="step-number">
                {i < step ? <Check size={14} /> : i + 1}
              </span>
              <span>{item.name}</span>
              {i < steps.length - 1 && (
                <ChevronRight className="step-chevron" size={15} />
              )}
            </button>
          ))}
        </nav>
        <div className="header-tools">
        <CoffeeLink className="app-coffee-link" />
        <button className="help-button" aria-label="How it works" title="How it works" onClick={() => helpDialog.current?.showModal()}><CircleHelp size={19} /><span>Help</span></button>
        <button
          className="projects-button"
          disabled={busy}
          onClick={() => { if (hostedWorkspace) helpDialog.current?.showModal(); else { projectDialog.current?.showModal(); void refreshProjects(); } }}
        >
          <FolderOpen size={18} />
          <span>{hostedWorkspace ? "Print locally" : "My projects"}</span>
        </button>
        </div>
      </header>
      {hostedWorkspace && <div className="hosting-note"><Monitor size={15} /><span>Design here. Generate and print on your computer.</span><button onClick={() => helpDialog.current?.showModal()}>How it works <ArrowRight size={14} /></button></div>}
      <div className="workspace" id="workspace">
        <aside
          className="sidebar"
          ref={panel}
          aria-label={`${active.name} settings`}
        >
          <div className="sidebar-title">
            <span className="eyebrow">
              STEP {String(step + 1).padStart(2, "0")} /{" "}
              {String(steps.length).padStart(2, "0")}
            </span>
            <h1 tabIndex={-1} ref={stepHeading}>
              {active.title}
            </h1>
            <p>{active.description}</p>
          </div>
          {step === 0 && (
            <div className="place-panel">
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
              if (step === 2) void generate();
            }}
          >
            <fieldset disabled={busy}>
              {step < 2 ? (
                <>
                  <SettingsPanel
                    key={step}
                    section={step === 0 ? "size" : "style"}
                    settings={s}
                    onChange={changeSettings}
                    fits={fits}
                    placing={placingMarker}
                    onPlace={(id) => {
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
                  <div className="review-card">
                    <span className="review-icon">
                      {ready ? <CircleCheck size={28} /> : <Layers size={28} />}
                    </span>
                    <strong>
                      {ready
                        ? "Your print pack is ready"
                        : failedModel ? "Let’s try that again."
                        : stale
                          ? "Ready for another look?"
                          : "Your artwork, at a glance"}
                    </strong>
                    <p>
                      {ready
                        ? "Inspect your model and download the complete set below."
                        : "We’ll turn your selected area into a 3D model and check every piece."}
                    </p>
                  </div>
                  {failedModel && <div className="generation-recovery" role="status">
                    <p>Your design is saved. Review your style or try generating again.</p>
                    {s.multicolour && <><p>You can also retry in single colour with the same place and details.</p><button type="button" onClick={() => { patch({ multicolour: false }); setError(""); }}><Printer size={16} />Use single-colour printing</button></>}
                    <button type="button" onClick={() => go(1)}><Palette size={16} />Review style</button>
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
                        go(0);
                        setView("layout");
                      }}
                    >
                      <Ruler size={18} />
                      <span>
                        <small>Finished size</small>
                        <strong>
                          {s.width} × {s.height} mm · {count} {tileNoun}
                        </strong>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                    <button type="button" onClick={() => reviewSettings("terrain")}>
                      <Mountain size={18} />
                      <span>
                        <small>Landscape</small>
                        <strong>{s.terrain_style.charAt(0).toUpperCase() + s.terrain_style.slice(1)} · {s.exaggeration}× height</strong>
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
                    <button type="button" onClick={() => go(1)}>
                      <Palette size={18} />
                      <span>
                        <small>Frame & special places</small>
                        <strong>
                          {s.frame_mode === "none" ? "No frame" : s.frame_mode === "separate" ? "Slide-in frame" : "Built-in frame"} ·{" "}
                          {s.markers.length} special{" "}
                          {s.markers.length === 1 ? "place" : "places"}
                        </strong>
                      </span>
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
                      "Individual STL print files",
                      "Assembled 3MF model",
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
              Save settings
            </button>
            <button
              disabled={busy}
              onClick={() => importInput.current?.click()}
            >
              <Upload size={15} />
              Import
            </button>
            <input
              ref={importInput}
              type="file"
              hidden
              accept="application/json,.json"
              onChange={(e) => {
                if (e.target.files?.[0]) void importSettings(e.target.files[0]);
                e.target.value = "";
              }}
            />
          </div>
          </Section>
        </aside>
        <main className="main">
          <div className="project-heading">
            <div>
              <span className="eyebrow">YOUR ARTWORK</span>
              <h2>{s.name}</h2>
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
                  ["layout", Ruler, "Tile layout"],
                  ["3d", Box, "3D preview"],
                ] as const
              ).map(([name, Icon, label]) => (
                <button
                  key={name}
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
              <span>{technicalFailure && error === job.message ? "We couldn’t generate this model. Your design is saved; recovery options are in Make." : error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={17} />
              </button>
            </div>
          )}
          {stale && view === "3d" && (
            <div className="stale-note">
              <TriangleAlert size={16} />
              <span>
                {geometryStale
                  ? "Updated landscape edges and frame support are available. Rebuild this model to apply them."
                  : "Changes haven’t been built yet. This preview uses your last generated settings."}
              </span>
              {step !== 2 && (
                <button onClick={() => go(2)}>
                  Update model <ArrowRight size={15} />
                </button>
              )}
            </div>
          )}
          {placingMarker && (
            <div className="placement-note" role="status">
              <MapPin size={18} />
              <span>Click inside the selected area to place your symbol.</span>
              <button onClick={() => setPlacingMarker(null)}>Cancel</button>
            </div>
          )}
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
              {view === "map" ? (
                <MapView
                  settings={s}
                  ratioLocked={mapRatioLocked}
                  onRatioLockedChange={setMapRatioLocked}
                  editable={!busy && step === 0}
                  onBounds={(bounds) => {
                    if (!busy && step === 0) patch({ bounds });
                  }}
                  placingMarker={busy ? null : placingMarker}
                  onPlaceMarker={(lon, lat) => {
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
                <LayoutView settings={s} fits={fits} />
              ) : model && job ? (
                <Preview
                  id={job.id}
                  model={model}
                  settings={s}
                  selected={selected}
                  onSelect={setSelected}
                  inspect={step === 2}
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
                  ) : step !== 2 ? (
                    <button onClick={() => go(2)}>
                      Continue to Make
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
                {view === "map"
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
                  ? `${model.settings.width} × ${model.settings.height}`
                  : `${s.width} × ${s.height}`}{" "}
                mm <span className="caption-divider">/</span>{" "}
                {view === "3d" && model
                  ? model.layout.columns * model.layout.rows
                  : count}{" "}
                {view === "3d" && model
                  ? model.layout.columns * model.layout.rows === 1
                    ? "tile"
                    : "tiles"
                  : tileNoun}
              </span>
            </div>
          </div>
          {step === 2 && model && job && (
            <PrintPackage
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
          {step !== 2 && (
            <div className="workspace-note">
              <span>
                {step === 0
                  ? view === "layout"
                    ? "The finished artwork includes the frame. Each tile prints separately and joins into one piece."
                    : "Adjust your selected area and artwork size, then make it your own."
                  : "Style changes are applied when you generate your model."}
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
                : step === 2 && ready
                  ? "Mesh checked · Print pack ready"
                  : `${s.width} × ${s.height} mm`}
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
          {step === 2 && ready && job ? (
            <a className="primary" href={`/api/files/${job.id}/project.zip`}>
              <Download size={18} />
              Download print pack
            </a>
          ) : (
            <button
              className="primary"
              disabled={
                busy ||
                (step === 2 && !canGenerate) ||
                (step === 0 && (!boundsValid || !fits || !s.name.trim()))
              }
              onClick={() => {
                if (step === 2) void generate();
                else {
                  const form =
                    document.querySelector<HTMLFormElement>("#settings-form");
                  if (!form || form.reportValidity()) go(step + 1);
                }
              }}
            >
              {busy ? <LoaderCircle className="spin" size={18} /> : null}
              {busy
                ? "Generating model…"
                : step === 2 && stale
                  ? "Update model"
                  : step === 2 && job?.status === "failed"
                    ? "Try generating again"
                    : step === 2 && hostedWorkspace
                      ? "Continue to local printing"
                      : active.next}
              {!busy && <ArrowRight size={17} />}
            </button>
          )}
        </div>
      </footer>
      <dialog ref={helpDialog} className="help-dialog" aria-labelledby="help-title" onClick={e => { if (e.target === e.currentTarget) helpDialog.current?.close(); }}>
        <div className="panel-heading"><div><span className="eyebrow">A LITTLE PIECE OF THE WORLD</span><h2 id="help-title">From map to mantelpiece.</h2></div><button aria-label="Close help" onClick={() => helpDialog.current?.close()}><X size={20} /></button></div>
        <p className="help-intro">Choose somewhere that means something to you. Turn its landscape into an artwork you can hold.</p>
        <ol className="help-steps">
          <li><MapPin size={22} /><div><strong>Find your place</strong><p>Search anywhere, move the selection, and choose a size that suits your space and printer.</p></div></li>
          <li><Palette size={22} /><div><strong>Give it your own character</strong><p>Shape the relief, pick a frame, and mark the places that matter.</p></div></li>
          <li><Printer size={22} /><div><strong>Make it on your computer</strong><p>{hostedWorkspace ? "Save your settings below. Open the local app, import the file, then choose Generate model. Your computer builds the printable pieces." : "Generate your model, inspect the preview, then download your print pack. Start with a fit-test piece before printing the full artwork."}</p></div></li>
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
      </dialog>
      <dialog
        ref={projectDialog}
        className="projects-dialog"
        aria-labelledby="projects-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) projectDialog.current?.close();
        }}
      >
        <div className="panel-heading">
          <div>
            <span className="eyebrow">ON THIS COMPUTER</span>
            <h2 id="projects-title">My projects</h2>
          </div>
          <button
            aria-label="Close projects"
            onClick={() => projectDialog.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        <p className="hint">
          Open a generated artwork to edit it or download its files.
        </p>
        <div className="project-library-tools">
          <label className="library-search"><Search size={17} /><input aria-label="Search saved projects" placeholder="Find an artwork…" value={projectQuery} onChange={(e) => setProjectQuery(e.target.value)} /></label>
          <select aria-label="Sort saved projects" value={projectSort} onChange={(e) => setProjectSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option></select>
        </div>
        <div className="project-library-summary"><span role="status">{projectsLoading ? "Refreshing projects…" : `${filteredProjects.length} ${filteredProjects.length === 1 ? "artwork" : "artworks"}`}</span><button disabled={!!opening} onClick={() => { if (defaultsRef.current) { setSettings(defaultsRef.current); setJob(null); setSelected(null); setError(""); clearPlaceSearch(); setMapRatioLocked(true); go(0); projectDialog.current?.close(); } }}><Plus size={16} />New artwork</button></div>
        {projectsError && <div className="inline-error" role="alert"><p>{projectsError}</p><button disabled={projectsLoading} onClick={() => void refreshProjects()}>Refresh projects</button></div>}
        <div className="project-list">
          {filteredProjects.length ? (
            filteredProjects.map((p) => (
              <button
                className="project-item"
                key={p.id}
                disabled={!!opening}
                onClick={() => void openProject(p.id)}
              >
                <span className="project-thumb">
                  <Layers size={24} />
                </span>
                <span>
                  <strong>{p.name}</strong>
                  <small>
                    {new Date(p.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}{" "}
                    · {p.layout.columns * p.layout.rows}{" "}
                    {p.layout.columns * p.layout.rows === 1 ? "tile" : "tiles"}
                  </small>
                  {p.width && p.height ? <small>{p.width} × {p.height} mm{p.terrain_style ? ` · ${p.terrain_style.charAt(0).toUpperCase() + p.terrain_style.slice(1)}` : ""}</small> : null}
                </span>
                {opening === p.id ? (
                  <LoaderCircle className="spin" size={19} />
                ) : (
                  <ArrowRight size={19} />
                )}
              </button>
            ))
          ) : projectsLoading ? (
            <div className="projects-empty" role="status"><LoaderCircle className="spin" size={28} /><p>Loading your artworks…</p></div>
          ) : projectsError ? null : (
            <div className="projects-empty">
              <FolderOpen size={35} />
              <h3>{projectQuery ? "No matching artworks." : "Your next project starts here."}</h3>
              <p>{projectQuery ? "Try another name or clear your search." : "Generated artworks will appear here automatically."}</p>
              {projectQuery && <button onClick={() => setProjectQuery("")}>Clear search</button>}
            </div>
          )}
        </div>
      </dialog>
    </div>
  );
}
