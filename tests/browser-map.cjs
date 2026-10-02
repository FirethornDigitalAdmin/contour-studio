// Run against the local app with Playwright, Chrome and WebKit available.
const { webkit, chromium } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const assert = require("node:assert/strict");
const { reveal } = require("./ui-helpers.cjs");
(async () => {
  for (const [name, engine] of [
    ["chrome", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await engine.launch({
      headless: true,
      ...(name === "chrome" ? { channel: "chrome" } : {}),
    });
    try {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        hasTouch: true,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(process.env.APP_URL || "http://127.0.0.1:8765");
      const box = page.locator(".selection-box"),
        host = page.locator(".map-host");
      await page
        .getByRole("button", { name: "Move selected area", exact: true })
        .waitFor();
      await page.waitForTimeout(350); // wait for the intentional fit animation
      const values = () =>
        page
          .locator('input[aria-label$=" coordinate"]')
          .evaluateAll((els) =>
            Object.fromEntries(
              els.map((e) => [
                e.getAttribute("aria-label").split(" ")[0],
                Number(e.value),
              ]),
            ),
          );
      const rect = () => box.boundingBox();
      const before = await values(),
        original = await rect();
      await page.mouse.move(
        original.x + original.width * 0.3,
        original.y + original.height * 0.4,
      );
      await page.mouse.down();
      await page.evaluate(() => {
        window.paintSamples = [];
        let last = performance.now();
        window.dragObserver = new MutationObserver(() => {
          const now = performance.now();
          window.paintSamples.push(now - last);
          last = now;
        });
        window.dragObserver.observe(document.querySelector(".selection-box"), {
          attributes: true,
          attributeFilter: ["style"],
        });
      });
      await page.mouse.move(
        original.x + original.width * 0.3 + 70,
        original.y + original.height * 0.4 + 30,
        { steps: 30 },
      );
      const during = await rect();
      assert(Math.abs(during.x - original.x - 70) < 2, "live horizontal move");
      assert(Math.abs(during.y - original.y - 30) < 2, "live vertical move");
      assert.deepEqual(
        await values(),
        before,
        "settings only commit on release",
      );
      await page.waitForTimeout(350);
      assert(
        Math.abs((await rect()).x - during.x) < 1,
        "no periodic snap-back",
      );
      await page.mouse.up();
      const moved = await values();
      assert.notDeepEqual(moved, before);
      assert(
        Math.abs(moved.east - moved.west - (before.east - before.west)) < 1e-8,
      );
      const perf = await page.evaluate(() => {
        window.dragObserver.disconnect();
        return window.paintSamples.filter((x) => x < 100).sort((a, b) => a - b);
      });
      console.log(
        name,
        "LIVE MOVE PASSED;",
        perf.length,
        "paint batches; p95 interval",
        perf[Math.floor(perf.length * 0.95)]?.toFixed(1),
        "ms",
      );
      // Resize updates throughout the gesture, holds the opposite corner, and locks the artwork opening ratio.
      const r = await rect(),
        handle = await page
          .getByRole("button", { name: "Resize se corner", exact: true })
          .boundingBox();
      await page.mouse.move(handle.x + 22, handle.y + 22);
      await page.mouse.down();
      await page.mouse.move(handle.x + 82, handle.y + 42, { steps: 15 });
      const resized = await rect();
      assert(resized.width > r.width + 30);
      assert(Math.abs(resized.x - r.x) < 1);
      assert(Math.abs(resized.width / resized.height - 580 / 380) < 0.01);
      await page.waitForTimeout(300);
      assert(Math.abs((await rect()).width - resized.width) < 1);
      await page.mouse.up();
      console.log(name, "LIVE RESIZE + RATIO PASSED");
      // Escape restores the exact committed bounds without applying the draft.
      const stable = await values(),
        b = await rect();
      await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.3);
      await page.mouse.down();
      await page.mouse.move(
        b.x + b.width * 0.3 - 35,
        b.y + b.height * 0.3 + 20,
        { steps: 8 },
      );
      await page.keyboard.press("Escape");
      await page.mouse.up();
      assert.deepEqual(await values(), stable);
      console.log(name, "ESCAPE CANCEL PASSED");
      // Draw previews before release and respects free shape as well as the locked mode.
      await page
        .getByRole("button", { name: "Draw new area", exact: true })
        .click();
      let h = await host.boundingBox();
      let sx = h.x + h.width * 0.28,
        sy = h.y + h.height * 0.36;
      await page.mouse.move(sx, sy);
      await page.mouse.down();
      await page.mouse.move(sx + 210, sy + 115, { steps: 12 });
      let drawn = await rect();
      assert(Math.abs(drawn.width / drawn.height - 580 / 380) < 0.01);
      assert.deepEqual(await values(), stable);
      await page.mouse.up();
      assert.notDeepEqual(await values(), stable);
      await page
        .getByRole("button", { name: "Ratio locked", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Draw new area", exact: true })
        .click();
      await page.mouse.move(sx, sy);
      await page.mouse.down();
      await page.mouse.move(sx + 200, sy + 90, { steps: 12 });
      await page.mouse.up();
      drawn = await rect();
      assert(Math.abs(drawn.width / drawn.height - 200 / 90) < 0.02);
      console.log(name, "LIVE DRAW + FREE SHAPE PASSED");
      // Map panning keeps geographic selection fixed; zoom also works over the box.
      const panBounds = await values();
      let rb = await rect();
      await page.getByRole("button", { name: "Pan map", exact: true }).click();
      await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        rb.x + rb.width / 2 + 45,
        rb.y + rb.height / 2 + 20,
        { steps: 10 },
      );
      await page.mouse.up();
      await page.waitForTimeout(400);
      assert.deepEqual(await values(), panBounds);
      assert(Math.abs((await rect()).x - rb.x) > 20);
      await page.getByRole("button", { name: "Move box", exact: true }).click();
      rb = await rect();
      await page.mouse.move(rb.x + rb.width * 0.3, rb.y + rb.height * 0.4);
      await page.mouse.wheel(0, -160);
      await page.waitForFunction(
        (w) =>
          document.querySelector(".selection-box").getBoundingClientRect()
            .width >
          w + 10,
        rb.width,
      );
      assert.deepEqual(await values(), panBounds);
      console.log(name, "PAN + WHEEL ZOOM PASSED");
      // Keyboard nudging and view remount preserve committed coordinates.
      const move = page.getByRole("button", {
        name: "Move selected area",
        exact: true,
      });
      await move.focus();
      await page.keyboard.press("ArrowRight");
      assert((await values()).west > panBounds.west);
      const committed = await values();
      await page.getByRole("button", { name: "3D preview", exact: true }).click();
      await page
        .getByRole("button", { name: "Map", exact: true })
        .click();
      await move.waitFor();
      assert.deepEqual(await values(), committed);
      console.log(name, "KEYBOARD + REMOUNT PASSED");
      // Real touch drag in Chrome, and mobile layout in both engines.
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole("button", { name: "Fit selection", exact: true })
        .click();
      await page.waitForTimeout(350);
      // Bring the map above the fixed mobile action bar before real touch input.
      await host.scrollIntoViewIfNeeded();
      const mh = await host.boundingBox(),
        mb = await rect();
      assert(
        mb.x >= mh.x + 20 && mb.x + mb.width <= mh.x + mh.width - 20,
        "mobile fit contains box horizontally",
      );
      assert(
        mb.y >= mh.y + 90 && mb.y + mb.height <= mh.y + mh.height - 45,
        "mobile fit contains box vertically",
      );
      await page.screenshot({ path: `data/selection-${name}-mobile.png` });
      if (name === "chrome") {
        const touchBefore = await values(),
          tb = await rect();
        const x = tb.x + tb.width * 0.3,
          y = tb.y + tb.height * 0.45;
        const cdp = await context.newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        });
        for (let i = 1; i <= 12; i++)
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: x + (30 * i) / 12, y: y + (15 * i) / 12 }],
          });
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        assert.notDeepEqual(await values(), touchBefore);
        console.log(name, "REAL TOUCH DRAG PASSED");
      }
      assert.equal(
        await page
          .locator(".map-handle")
          .first()
          .evaluate((e) => e.clientWidth),
        44,
      );
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page
        .getByRole("button", { name: "Fit selection", exact: true })
        .click();
      await page.waitForTimeout(350);
      await page.screenshot({ path: `data/selection-${name}-desktop.png` });
      const savedBounds = await values();
      const saveButton = page.locator(".sidebar").getByRole("button", { name: "Save settings", exact: true, includeHidden: true });
      await reveal(page, saveButton);
      const downloadReady = page.waitForEvent("download");
      await saveButton.click();
      const download = await downloadReady;
      const file = await download.path();
      assert.deepEqual(
        JSON.parse(require("node:fs").readFileSync(file, "utf8")).bounds,
        savedBounds,
      );
      assert.deepEqual(errors, []);
      console.log(
        name,
        "MOBILE FIT + SETTINGS EXPORT + NO JAVASCRIPT ERRORS PASSED",
      );
    } finally {
      await browser.close();
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
