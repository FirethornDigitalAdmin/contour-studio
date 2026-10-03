import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { api, hostedWorkspace } from "./hosted";

type Update = { desktop: boolean; current_version: string; releases_url: string; status?: string;
  latest_version?: string; release_notes?: string; release_url?: string; download_url?: string };

type InstallState = { status: string; progress?: number | null; message?: string };
type NativeUpdater = { install_update: () => Promise<InstallState>; update_status: () => Promise<InstallState>; restart_for_update: () => Promise<InstallState> };
const nativeUpdater = () => (window as Window & { pywebview?: { api?: NativeUpdater } }).pywebview?.api;

export default function AppUpdates({ busy = false }: { busy?: boolean }) {
  const [update, setUpdate] = useState<Update | null>(null);
  const [installation, setInstallation] = useState<InstallState>({ status: "idle" });
  const [nativeReady, setNativeReady] = useState(!!nativeUpdater());
  const restarting = useRef(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  async function check(manual = false) {
    if (manual && !dialog.current?.open) dialog.current?.showModal();
    if (inFlight.current) return;
    inFlight.current = true;
    setChecking(true); setError("");
    try { setUpdate(await api<Update>("/updates/check")); }
    catch { if (manual || dialog.current?.open) setError("Couldn’t check for updates. Check your internet connection and try again."); }
    finally { setChecking(false); inFlight.current = false; }
  }
  useEffect(() => {
    if (hostedWorkspace) return;
    let active = true;
    void api<Update>("/updates").then(info => {
      if (active && info.desktop) { setUpdate(info); void check(); }
    }).catch(() => { /* Older local servers do not expose desktop updates. */ });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!update?.desktop) return;
    const onMenu = (event: Event) => {
      if ((event as CustomEvent<string>).detail === "updates") {
        document.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach(open => {
          if (open !== dialog.current) open.close();
        });
        void check(true);
      }
    };
    window.addEventListener("contour:menu", onMenu);
    return () => window.removeEventListener("contour:menu", onMenu);
  }, [update?.desktop]);
  useEffect(() => {
    const ready = () => setNativeReady(!!nativeUpdater());
    window.addEventListener("pywebviewready", ready);
    ready();
    return () => window.removeEventListener("pywebviewready", ready);
  }, []);
  useEffect(() => {
    if (!["downloading", "preparing", "ready"].includes(installation.status)) return;
    let active = true;
    const poll = async () => {
      try {
        const bridge = nativeUpdater();
        if (!bridge) throw new Error("The desktop updater is unavailable. Reopen the app and try again.");
        const state = await bridge.update_status();
        if (!active) return;
        setInstallation(state);
        if (state.status === "ready" && !busy && !restarting.current) {
          restarting.current = true;
          window.dispatchEvent(new Event("pagehide"));
          const result = await bridge.restart_for_update();
          if (active) setInstallation(result);
          if (result.status !== "installing") restarting.current = false;
        }
      } catch (failure) { if (active) setInstallation({ status: "error", message: (failure as Error).message }); }
    };
    const timer = window.setInterval(() => void poll(), 500);
    return () => { active = false; window.clearInterval(timer); };
  }, [installation.status, busy]);
  const installing = ["downloading", "preparing", "ready", "installing"].includes(installation.status);
  async function install() {
    try {
      const bridge = nativeUpdater();
      if (!bridge) throw new Error("The desktop updater is unavailable. Reopen the app and try again.");
      setInstallation(await bridge.install_update());
    } catch (failure) { setInstallation({ status: "error", message: (failure as Error).message }); }
  }
  if (!update?.desktop) return null;
  return <>
    <button ref={button} className={`help-button update-button${update.status === "available" ? " has-update" : ""}`} aria-label={update.status === "available" ? "Update available" : "Check for updates"} onClick={() => void check(true)} title="Check for updates">
      <RefreshCw size={18} /><span>{update.status === "available" ? "Update available" : "Check for updates"}</span>
    </button>
    <dialog ref={dialog} className="help-dialog update-dialog" aria-labelledby="update-title" onClose={() => button.current?.focus()} onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
      <div className="panel-heading"><h2 id="update-title">App updates</h2><button aria-label="Close updates" onClick={() => dialog.current?.close()}><X size={20} /></button></div>
      <p>Installed version: {update.current_version}</p>
      <div role="status" aria-live="polite">{checking ? <p>Checking for updates…</p> : error ? <p>{error}</p> : update.status === "current" ? <p>You’re up to date with releases available for your computer.</p> : update.status === "available" ? <>
        <h3>Contour Studio {update.latest_version} is available.</h3>
        <pre className="update-notes">{update.release_notes || "See the release page for details."}</pre>
        <p>The update downloads here, replaces this app and restarts it. Your saved projects and settings stay on this computer.</p>
        {update.download_url ? <button className="primary update-download" disabled={!nativeReady || busy || installing} onClick={() => void install()}><Download size={17} />{installing ? "Updating…" : "Download & install"}</button> : <p>No installer is available for this computer. Check the release page for supported platforms.</p>}
        {busy && <p className="hint">Finish model generation before installing an update.</p>}
        {installation.status === "downloading" && <p>Downloading update{installation.progress != null ? ` · ${installation.progress}%` : "…"}</p>}
        {installation.status === "downloading" && installation.progress != null && <progress aria-label="Update download" value={installation.progress} max={100} />}
        {["preparing", "ready", "installing", "error", "current"].includes(installation.status) && <p role={installation.status === "error" ? "alert" : undefined}>{installation.status === "ready" && busy ? "Update downloaded. Finish model generation to restart and install." : installation.message}</p>}
        <p><a href={update.release_url} target="_blank" rel="noopener noreferrer">Read release notes on GitHub</a></p>
      </> : null}</div>
      {!checking && !installing && <button onClick={() => void check()}>Check again</button>}
      <p className="hint"><a href={update.releases_url} target="_blank" rel="noopener noreferrer">Browse all releases</a></p>
    </dialog>
  </>;
}
