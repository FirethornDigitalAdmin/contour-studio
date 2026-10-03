import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, X } from "lucide-react";
import { api, hostedWorkspace } from "./hosted";

type Update = { desktop: boolean; current_version: string; releases_url: string; status?: string;
  latest_version?: string; release_notes?: string; release_url?: string; download_url?: string };

export default function AppUpdates() {
  const [update, setUpdate] = useState<Update | null>(null);
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
  if (!update?.desktop) return null;
  return <>
    <button ref={button} className={`help-button update-button${update.status === "available" ? " has-update" : ""}`} aria-label={update.status === "available" ? "Update available" : "Updates"} onClick={() => void check(true)} title="Check for updates">
      <RefreshCw size={18} /><span>{update.status === "available" ? "Update available" : "Updates"}</span>
    </button>
    <dialog ref={dialog} className="help-dialog update-dialog" aria-labelledby="update-title" onClose={() => button.current?.focus()} onClick={e => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
      <div className="panel-heading"><h2 id="update-title">App updates</h2><button aria-label="Close updates" onClick={() => dialog.current?.close()}><X size={20} /></button></div>
      <p>Installed version: {update.current_version}</p>
      <div role="status" aria-live="polite">{checking ? <p>Checking for updates…</p> : error ? <p>{error}</p> : update.status === "current" ? <p>You’re up to date with releases available for your computer.</p> : update.status === "available" ? <>
        <h3>Contour Studio {update.latest_version} is available.</h3>
        <pre className="update-notes">{update.release_notes || "See the release page for details."}</pre>
        <p>Download the installer, finish any active generation, then close Contour Studio before installing. Your saved projects and settings stay on this computer.</p>
        {update.download_url ? <a className="primary update-download" href={update.download_url} target="_blank" rel="noopener noreferrer"><Download size={17} />Download update</a> : <p>No installer is available for this computer. Check the release page for supported platforms.</p>}
        <p><a href={update.release_url} target="_blank" rel="noopener noreferrer">Read release notes on GitHub</a></p>
      </> : null}</div>
      {!checking && <button onClick={() => void check()}>Check again</button>}
      <p className="hint"><a href={update.releases_url} target="_blank" rel="noopener noreferrer">Browse all releases</a></p>
    </dialog>
  </>;
}
