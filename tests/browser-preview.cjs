// Exercise real exported multicolour geometry and files. Set PREVIEW_JOB_ID to select a project.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { reveal } = require("./ui-helpers.cjs");
const url = process.env.APP_URL || "http://127.0.0.1:8765";

(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ baseURL: url, viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  let previewRequests = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (request.url().endsWith("/preview.glb")) previewRequests++; });
  const button = (name) => page.getByRole("button", { name, exact: true });
  const png = async () => {
    const pending = page.waitForEvent("download");
    await button("Save image").click();
    const download = await pending;
    assert.match(download.suggestedFilename(), /-preview\.png$/);
    return fs.readFileSync(await download.path());
  };
  try {
    let job;
    if (process.env.PREVIEW_JOB_ID) {
      const response = await page.request.get(`/api/jobs/${encodeURIComponent(process.env.PREVIEW_JOB_ID)}`);
      assert(response.ok(), "the chosen project exists");
      job = await response.json();
    } else {
      const projects = await (await page.request.get("/api/projects")).json();
      for (const project of projects.slice(0, 30)) {
        const candidate = await (await page.request.get(`/api/jobs/${project.id}`)).json();
        if (candidate.result?.multicolour?.enabled) { job = candidate; break; }
      }
    }
    assert(job?.result?.multicolour?.enabled, "create a real multicolour project first, or set PREVIEW_JOB_ID");
    const model = job.result;
    assert(model.multicolour.tiles.length > 0, "the project has colour print pieces");
    await page.addInitScript(({ model, id }) => {
      localStorage.setItem("contour-studio.draft.v1", JSON.stringify({ version: 1, settings: model.settings, jobId: id, step: 2, view: "3d" }));
      // Old saved solid colours must not overwrite semantic print materials.
      localStorage.setItem("contour-studio-preview-v1", JSON.stringify({ terrain: "#ed3eba", frame: "#bb3311" }));
    }, { model, id: job.id });
    await page.goto(url);
    await page.locator(".preview canvas").waitFor();
    await page.locator(".canvas-message").waitFor({ state: "hidden", timeout: 60000 });
    await page.locator(".preview-colour-status").filter({ hasText: "Print colours" }).waitFor();
    await button("Appearance").click();
    assert.equal(await page.getByLabel("Colour view", { exact: true }).inputValue(), "print");
    assert.equal(await page.getByLabel("Terrain colour", { exact: true }).count(), 0);
    assert.equal(await page.locator(".preview-print-palette > div").count(), model.multicolour.palette.length);
    await button("Close appearance controls").click();
    await page.locator(".preview").screenshot({ path: "data/multicolour-preview-desktop.png" });
    await page.getByLabel("Camera view", { exact: true }).selectOption("top");
    const originalPng = await png();
    fs.writeFileSync("data/multicolour-model-preview.png", originalPng);
    await button("Appearance").click();
    await page.getByLabel("Colour view", { exact: true }).selectOption("override");
    assert.equal(await page.getByLabel("Terrain colour", { exact: true }).inputValue(), "#ed3eba");
    await button("Close appearance controls").click();
    const overridePng = await png();
    assert.notDeepEqual(overridePng, originalPng, "display override visibly changes the real rendered geometry");
    await button("Appearance").click();
    await page.getByLabel("Colour view", { exact: true }).selectOption("print");
    await button("Close appearance controls").click();

    // A click on a semantic region must select its parent printable piece.
    const canvas = await page.locator(".preview canvas").boundingBox();
    await page.mouse.click(canvas.x + canvas.width * 0.55, canvas.y + canvas.height * 0.54);
    await page.locator(".selected-info").waitFor();
    const selectedId = await page.getByLabel("Inspect a piece", { exact: true }).inputValue();
    assert(model.parts.some((part) => part.id === selectedId), "material mesh selection retains the parent piece ID");
    await button("Focus").click();
    await button("Only this piece").click();
    await button("Show all").click();
    await button("Separate pieces").click();
    await button("Join pieces").click();

    const manifestResponse = await page.request.get(`/api/files/${job.id}/Multicolour/materials.json`);
    assert(manifestResponse.ok(), "real filament manifest downloads");
    assert.equal((await manifestResponse.json()).palette.length, model.multicolour.palette.length);
    for (const tile of model.multicolour.tiles) {
      const file = await page.request.get(`/api/files/${job.id}/${tile.file}`);
      assert(file.ok(), `${tile.part_id} colour 3MF downloads`);
      assert.equal((await file.body()).subarray(0, 2).toString(), "PK", "3MF is a ZIP package");
      for (const material of tile.materials) {
        const materialFile = await page.request.get(`/api/files/${job.id}/${material.file}`);
        assert(materialFile.ok(), `${tile.part_id} ${material.id} aligned material STL downloads`);
        assert((await materialFile.body()).length > 84, "material STL has geometry");
      }
    }
    assert.equal(await page.locator(".colour-tile-card").count(), model.multicolour.tiles.length);
    await page.locator(".colour-material-files summary").first().click();
    assert(await page.locator(".colour-material-files a").first().isVisible());
    await button("Style").click();
    await page.locator(".canvas-message").waitFor({ state: "hidden", timeout: 60000 });
    const beforeColourChange = await png();
    const requestsBefore = previewRequests;
    await reveal(page, page.getByLabel("Grass & terrain print colour", { exact: true }));
    await page.getByLabel("Grass & terrain print colour", { exact: true }).fill("#6655ee");
    await page.locator(".preview-colour-status").filter({ hasText: "Colour preview" }).waitFor();
    assert.notDeepEqual(await png(), beforeColourChange, "print colour edit updates the geometry immediately");
    assert.equal(previewRequests, requestsBefore, "colour edits do not reload geometry");
    assert.equal((await (await page.request.get(`/api/files/${job.id}/Multicolour/materials.json`)).json()).palette.find((material) => material.id === "ground").colour, model.multicolour.palette.find((material) => material.id === "ground").colour, "colour edits leave the saved print files intact until a rebuild");
    await page.getByLabel("Grass & terrain print colour", { exact: true }).fill(model.settings.colour_ground);
    await button("Review & make").click();
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator(".multicolour-package").scrollIntoViewIfNeeded();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `colour controls and print files fit ${width}px`);
      if (width === 390) {
        await page.locator(".multicolour-package").screenshot({ path: "data/multicolour-package-mobile.png" });
        await page.locator(".preview").screenshot({ path: "data/multicolour-preview-mobile.png" });
      }
    }
    assert.deepEqual(errors, []);
    console.log("PASS: semantic GLB colours and piece selection, explicit display override, live palette without reloading geometry, real colour 3MFs/material STLs/manifest, unchanged saved exports and responsive print package; no page errors.");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
