// Artwork choices must change the real crop without a map gesture.
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const { reveal } = require("./ui-helpers.cjs");
const url = process.env.APP_URL || "http://127.0.0.1:8765";

(async () => {
  for (const [name, engine] of [["chrome", chromium], ["webkit", webkit]]) {
    const browser = await engine.launch({ headless: true, ...(name === "chrome" ? { channel: "chrome" } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const button = label => page.getByRole("button", { name: label, exact: true });
    const bounds = () => page.locator('input[aria-label$=" coordinate"]').evaluateAll(inputs =>
      Object.fromEntries(inputs.map(input => [input.getAttribute("aria-label").split(" ")[0], Number(input.value)])));
    const expectRatio = async ratio => {
      await page.waitForFunction(expected => {
        const box = document.querySelector(".selection-box")?.getBoundingClientRect();
        return box && box.height > 0 && Math.abs(box.width / box.height - expected) < .001;
      }, ratio);
    };
    const expectGrid = async (columns, rows) => page.waitForFunction(([cols, count]) =>
      document.querySelectorAll(".selection-grid-x").length === cols - 1 &&
      document.querySelectorAll(".selection-grid-y").length === count - 1, [columns, rows]);
    try {
      await page.goto(url);
      await button("Move selected area").waitFor();
      const original = await bounds();
      await button("Square 600 × 600").click();
      await expectRatio(1);
      const square = await bounds();
      assert.notDeepEqual(square, original, "preset changes the saved geographic crop");
      assert.equal(square.west, original.west);
      assert.equal(square.east, original.east);
      await button("Undo design change").click();
      assert.deepEqual(await bounds(), original, "one undo restores the dimensions and crop together");
      assert.equal(await page.getByLabel("Height · mm", { exact: true }).inputValue(), "400");
      await button("Redo design change").click();
      assert.deepEqual(await bounds(), square);
      await expectRatio(1);

      for (const [label, ratio] of [["Small 400 × 300", 380 / 280], ["Classic 600 × 400", 580 / 380], ["Square 600 × 600", 1]]) {
        await button(label).click();
        await expectRatio(ratio);
      }
      await page.getByLabel("Width · mm", { exact: true }).fill("800");
      await page.getByLabel("Width · mm", { exact: true }).press("Tab");
      await expectRatio(780 / 580);
      await button("Rotate size").click();
      await expectRatio(580 / 780);

      await button("Ratio locked").click();
      const free = await bounds();
      await button("Small 400 × 300").click();
      assert.deepEqual(await bounds(), free, "free shape preserves the chosen area");
      await button("Tile layout").click();
      await button("Map").click();
      await button("Free shape").waitFor();
      await button("Free shape").click();
      await expectRatio(380 / 280);
      await button("Tile layout").click();
      await button("Square 600 × 600").click();
      await button("Map").click();
      await expectRatio(1);

      const presets = [
        ["Bambu Lab A1 mini", 180, 180, 180, 4, 4],
        ["Bambu Lab P1S", 256, 256, 256, 3, 3],
        ["Creality Ender-3 V3 SE", 220, 220, 250, 3, 3],
        ["Creality K1 Max", 300, 300, 300, 3, 3],
        ["Original Prusa MK4S", 250, 210, 220, 3, 3],
      ];
      await reveal(page, page.getByText("Change printer settings", { exact: true }));
      for (const [model, width, depth, height, columns, rows] of presets) {
        const preset = button(`${model} ${width} × ${depth} × ${height} mm`);
        await preset.click();
        assert.equal(await preset.getAttribute("aria-pressed"), "true");
        assert.equal(await page.getByLabel("Build width · mm", { exact: true }).inputValue(), String(width));
        assert.equal(await page.getByLabel("Build depth · mm", { exact: true }).inputValue(), String(depth));
        assert.equal(await page.getByLabel("Build height · mm", { exact: true }).inputValue(), String(height));
        await expectGrid(columns, rows);
      }
      const custom = button("Custom build plate Enter your own dimensions");
      await custom.click();
      assert(await page.getByLabel("Build width · mm", { exact: true }).isVisible(), "custom choice reveals dimension inputs");
      for (const [label, value] of [["Build width · mm", "275"], ["Build depth · mm", "195"], ["Build height · mm", "225"], ["Plate margin · mm", "8"]]) {
        await page.getByLabel(label, { exact: true }).fill(value);
        await page.getByLabel(label, { exact: true }).press("Tab");
      }
      assert.equal(await custom.getAttribute("aria-pressed"), "true");
      await expectGrid(3, 4);
      await page.getByText("Usable plate: 259 × 179 mm after margins.", { exact: false }).waitFor();
      await page.reload(); // pagehide flushes the actual saved design
      await button("Move selected area").waitFor();
      await reveal(page, page.getByText("Change printer settings", { exact: true }));
      assert.equal(await custom.getAttribute("aria-pressed"), "true");
      assert.equal(await page.getByLabel("Build width · mm", { exact: true }).inputValue(), "275");
      assert.equal(await page.getByLabel("Build depth · mm", { exact: true }).inputValue(), "195");
      assert.equal(await page.getByLabel("Plate margin · mm", { exact: true }).inputValue(), "8");
      await page.screenshot({ path: `data/artwork-size-${name}-desktop.png` });

      await page.setViewportSize({ width: 390, height: 844 });
      await button("Classic 600 × 400").click();
      await expectRatio(580 / 380);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "mobile controls fit the screen");
      await page.locator(".map-host").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `data/artwork-size-${name}-mobile.png` });
      assert.deepEqual(errors, []);
      console.log(`PASS ${name}: immediate size/crop and tile-guide updates, one-step undo/redo, custom sizes, rotation, free shape, hidden map, named printers, custom plate recovery and mobile layout; no JavaScript errors.`);
    } finally {
      await browser.close();
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
