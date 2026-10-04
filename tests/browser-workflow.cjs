// End-to-end UI checks against the real local API. The small generation uses cached geographic data.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { reveal } = require("./ui-helpers.cjs");
const url = process.env.APP_URL || "http://127.0.0.1:8765";
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
    baseURL: url,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const btn = (name) => page.getByRole("button", { name, exact: true, includeHidden: true });
  const noOverflow = async () =>
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "no horizontal overflow",
    );
  try {
    await page.goto(url);
    await btn("Choose location").click();
    await page
      .getByLabel("Search for a place", { exact: true })
      .fill("Keswick");
    await btn("Search").click();
    await page
      .locator(".search-results button")
      .first()
      .waitFor({ timeout: 30000 });
    await page.locator(".search-results button").first().click();
    assert.match(
      await page.locator(".current-place strong").innerText(),
      /Keswick/i,
    );
    await page.locator(".stepper").getByRole("button", { name: /Format/ }).click();
    await btn("Tile layout").click();
    await page.getByRole("group", { name: /artwork divided/ }).waitFor();
    await btn("Square 600 × 600").click();
    assert.equal(
      await page.getByLabel("Height · mm", { exact: true }).inputValue(),
      "600",
    );
    await page.locator(".stepper").getByRole("button", { name: /Make/ }).click();
    await reveal(page, btn("Custom"));
    await btn("Custom").click();
    await page.getByLabel("Columns", { exact: true }).fill("1");
    await page.getByLabel("Rows", { exact: true }).fill("1");
    await page.locator(".tile-summary.invalid").waitFor();
    await btn("Automatic").click();
    await reveal(page, btn("Custom"));
    await page.locator(".tile-summary:not(.invalid)").waitFor();
    await page.locator(".stepper").getByRole("button", { name: /Details/ }).click();
    await page.getByRole("button", { name: /^Bold city/ }).click();
    await page
      .locator(".style-presets button[aria-pressed=true]")
      .filter({ hasText: "Bold city" })
      .waitFor();
    await reveal(page, btn("Add a special place"));
    await btn("Add a special place").click();
    await page.getByLabel("Place 1 name", { exact: true }).fill("Home");
    await btn("Star").click();
    await page.locator(".placement-note").waitFor();
    // An invalid click must leave placement active so the user can immediately try again.
    const host = await page.locator(".map-host").boundingBox();
    await page.mouse.click(host.x + 20, host.y + host.height * 0.65);
    await page
      .getByText("Choose a point inside the selected box.", { exact: false })
      .waitFor();
    const box = await page.locator(".selection-box").boundingBox();
    await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45);
    await page.locator(".placement-note").waitFor({ state: "hidden" });
    assert.equal(await page.locator(".location-symbol").textContent(), "★");
    await btn("Choose frame").click();
    await btn("Review & make").click();
    await page.getByRole("heading", { name: "Make your artwork." }).waitFor();
    await page.locator(".stepper").getByRole("button", { name: /Format/ }).click();
    assert.equal(
      await page.getByLabel("Height · mm", { exact: true }).inputValue(),
      "600",
    );
    await page.locator(".stepper").getByRole("button", { name: /Details/ }).click();
    await reveal(page, page.locator(".marker-heading"));
    assert.match(await page.locator(".marker-heading").innerText(), /Home/);
    const saveButton = page.locator(".sidebar").getByRole("button", { name: "Save settings", exact: true, includeHidden: true });
    await reveal(page, saveButton);
    const downloadPromise = page.waitForEvent("download");
    await saveButton.click();
    const saved = JSON.parse(
      fs.readFileSync(await (await downloadPromise).path(), "utf8"),
    );
    assert.equal(saved.markers[0].label, "Home");
    assert.equal(saved.markers[0].symbol, "star");
    assert.equal(saved.building_style, "realistic");
    console.log(
      "PASS: search, size presets, invalid/custom/automatic tiling, styles, marker placement and retry, step persistence, settings export",
    );
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow();
      const footer = await page.locator(".workflow-footer").boundingBox();
      assert(
        footer.y >= 0 && footer.y + footer.height <= 901,
        "persistent action bar is visible",
      );
    }
    await btn("My projects").click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await btn("My projects").click();
    await page.locator(".project-item").first().click();
    await page
      .getByRole("link", { name: "Download ZIP", exact: true })
      .waitFor({ timeout: 30000 });
    await page.locator(".preview canvas").waitFor();
    await page
      .locator(".canvas-message")
      .waitFor({ state: "hidden", timeout: 30000 });
    await btn("Separate pieces").click();
    await btn("Join pieces").click();
    await btn("Wireframe").click();
    await btn("Wireframe").click();
    await page.locator(".parts-details > summary").click();
    await page.locator("tbody tr td button").first().click();
    await page.locator(".selected-info").waitFor();
    for (const link of await page.locator(".download-cards a").all())
      assert((await page.request.get(await link.getAttribute("href"))).ok());
    assert(
      (
        await page.request.get(
          await page.locator(".stl-download").first().getAttribute("href"),
        )
      ).ok(),
    );
    await page.locator(".stepper").getByRole("button", { name: /Details/ }).click();
    await page.getByRole("button", { name: /^Minimal/ }).click();
    await page.locator(".stale-note").waitFor();
    await btn("Choose frame").click();
    await btn("Review & make").click();
    await btn("Update model").waitFor();
    assert.equal(
      await page
        .getByRole("link", { name: "Download print pack", exact: true })
        .count(),
      0,
    );
    console.log(
      "PASS: responsive action bar, project dialog and Escape, saved 3D model, piece inspection, real downloads, stale preview and rebuild action",
    );
    const preset = await (await page.request.get("/api/preset")).json();
    const sample = {
      ...preset,
      name: `Keswick · UI check ${Date.now()}`,
      width: 120,
      height: 90,
      resolution: 64,
      roads: "none",
      water: false,
      buildings: false,
      joints: false,
      labels: false,
      markers: [
        {
          id: "ui-check",
          label: "Home",
          symbol: "heart",
          lon: (preset.bounds.west + preset.bounds.east) / 2,
          lat: (preset.bounds.south + preset.bounds.north) / 2,
          size: 8,
          rise: 3,
        },
      ],
    };
    await page.locator("input[type=file]").setInputFiles({
      name: "settings.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(sample)),
    });
    await page.getByRole("heading", { name: "Choose your place." }).waitFor();
    await btn("3 Make").click();
    await btn("Update model").waitFor();
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/generate") && r.request().method() === "POST"),
      btn("Update model").click(),
    ]);
    assert.equal(response.status(), 202);
    const { id } = await response.json();
    fs.writeFileSync("data/ui-verification-job.txt", id);
    await page
      .getByRole("button", { name: "Generating model…", exact: true })
      .waitFor();
    assert(await btn("My projects").isDisabled());
    assert(await btn("Import").isDisabled());
    await page
      .getByRole("link", { name: "Download print pack", exact: true })
      .waitFor({ timeout: 180000 });
    await page
      .locator(".canvas-message")
      .waitFor({ state: "hidden", timeout: 30000 });
    const result = await (await page.request.get("/api/jobs/" + id)).json();
    assert.equal(result.status, "complete");
    assert.equal(result.result.model.features.markers, 1);
    const zip = await page.request.get("/api/files/" + id + "/project.zip");
    assert(zip.ok());
    assert.equal((await zip.body()).subarray(0, 2).toString(), "PK");
    await page.screenshot({ path: "data/ui-verified-make.png" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: imported settings, real generation with a raised marker, locked settings during generation, automatic 3D preview, validated ZIP, no JavaScript errors",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
