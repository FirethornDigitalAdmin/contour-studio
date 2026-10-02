import React, { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
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
  useEffect(() => { document.title = workspace ? "Contour Studio · Printable landscapes" : "Contour Studio · Free & open-source 3D map art"; }, [workspace]);
  return <Suspense fallback={<p className="entry-loading" role="status">Opening Contour Studio…</p>}>{workspace ? <App /> : <DownloadSite />}</Suspense>;
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Entry />
  </React.StrictMode>,
);
