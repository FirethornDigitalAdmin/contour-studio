// Render the real landing page into the static build so crawlers and browsers
// receive the same meaningful content without waiting for JavaScript.
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import React, { Suspense } from "react";
import { renderToString } from "react-dom/server";

const server = await createServer({ mode: "hosted", server: { middlewareMode: true }, appType: "custom" });
try {
  const { default: DownloadSite } = await server.ssrLoadModule("/src/DownloadSite.tsx");
  function Landing() {
    return React.createElement(Suspense, { fallback: null }, React.createElement(DownloadSite));
  }
  const markup = renderToString(React.createElement(React.StrictMode, null, React.createElement(Landing)));
  const file = new URL("../dist-hosted/index.html", import.meta.url);
  const html = await readFile(file, "utf8");
  const manifest = JSON.parse(await readFile(new URL("../dist-hosted/.vite/manifest.json", import.meta.url), "utf8"));
  const styles = new Set();
  const visited = new Set();
  function collectStyles(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing homepage build chunk: ${key}`);
    for (const css of chunk.css || []) styles.add(css);
    for (const dependency of chunk.imports || []) collectStyles(dependency);
  }
  collectStyles("src/DownloadSite.tsx");
  const links = [...styles].filter(css => !html.includes(`href="./${css}"`)).map(css => `    <link rel="stylesheet" crossorigin href="./${css}" />`).join("\n");
  const root = '<div id="root"></div>';
  if (!html.includes(root)) throw new Error("Expected an empty root in the freshly built homepage.");
  // Avoid interpreting $ in React's Suspense markers as replacement patterns.
  await writeFile(file, html.replace(root, () => `<div id="root">${markup}</div>`).replace("  </head>", () => `${links}\n  </head>`));
  console.log("Prerendered Contour Studio homepage, navigation and downloads.");
} finally {
  await server.close();
}
