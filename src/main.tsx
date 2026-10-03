import React, { lazy, Suspense, useEffect, useState } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { hostedWorkspace } from "./hosted";
const App = lazy(() => import("./App"));
const DownloadSite = lazy(() => import("./DownloadSite"));
import "./style.css";
import "./workspace.css";
import "./desktop-ui.css";
import "./support.css";

function Entry() {
  const [workspace, setWorkspace] = useState(!hostedWorkspace || window.location.hash === "#workspace");
  useEffect(() => {
    const change = () => setWorkspace(!hostedWorkspace || window.location.hash === "#workspace");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => { document.title = workspace ? "Map Art Designer | Contour Studio" : "Contour Studio | Free 3D-Printable Map Art"; }, [workspace]);
  return <Suspense fallback={workspace ? <p className="entry-loading" role="status">Opening Contour Studio…</p> : null}>{workspace ? <App /> : <DownloadSite />}</Suspense>;
}
const root = document.getElementById("root")!;
const entry = (
  <React.StrictMode>
    <Entry />
  </React.StrictMode>
);
if (hostedWorkspace && window.location.hash !== "#workspace" && root.hasChildNodes()) {
  hydrateRoot(root, entry);
} else {
  createRoot(root).render(entry);
}
