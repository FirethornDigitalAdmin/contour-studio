// Regressions for edits that cross numeric, preset, frame and browser-storage boundaries.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { reveal } = require("./ui-helpers.cjs");
const url = process.env.APP_URL || "http://127.0.0.1:8765";

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const button = name => page.getByRole("button", { name, exact: true, includeHidden: true });
  const control = name => page.getByLabel(name, { exact: true });
  const settings = () => page.evaluate(() => JSON.parse(localStorage.getItem("contour-studio.draft.v1")).settings);
  const waitSetting = (key, value) => page.waitForFunction(([key, value]) => JSON.parse(localStorage.getItem("contour-studio.draft.v1") || "{}").settings?.[key] === value, [key, value]);
  async function open(control) { await reveal(page, control); }
  try {
    // Do not let another local generation redirect an independent controls check.
    await page.route("**/api/active-job", route => route.fulfill({ contentType: "application/json", body: "null" }));
    await page.goto(url);
    await button("Make it yours").waitFor();
    const width = control("Width · mm");
    await width.fill("450");
    await waitSetting("width", 450);
    await width.fill("500");
    await waitSetting("width", 500);
    await width.press("Escape");
    await waitSetting("width", 600);
    assert.equal(await width.inputValue(), "600", "Escape restores the value from before all live edits");
    await width.fill("9999");
    assert.equal(await width.getAttribute("aria-invalid"), "true");
    await width.press("Escape");
    assert.equal(await width.inputValue(), "600", "Escape also discards an invalid draft");
    const saveSettings = page.locator(".sidebar").getByRole("button", { name: "Save settings", exact: true, includeHidden: true });
    await open(saveSettings);
    await width.fill("9999");
    const download = page.waitForEvent("download");
    await saveSettings.click();
    const exported = JSON.parse(fs.readFileSync(await (await download).path(), "utf8"));
    assert.equal(exported.width, 2000, "a pointer click survives invalid-input correction and downloads the committed settings");
    await width.fill("600");
    await width.press("Tab");

    await button("Make it yours").click();
    await open(control("Forest effects"));
    await control("Forest effects").check();
    await control("Field effects").check();
    await control("Historic sites & landmarks").check();
    await waitSetting("landmarks", true);
    await button("Natural").click();
    await waitSetting("forests", false);
    const natural = await settings();
    assert.equal(natural.fields, false);
    assert.equal(natural.landmarks, false);
    assert.equal(natural.buildings, true);
    assert.equal(natural.roads, "raised", "style presets reset feature choices from the previous style");

    const styleName = control("Custom style name");
    await open(styleName);
    await page.getByText("Your saved styles will appear here.", { exact: true }).waitFor();
    await styleName.fill("My favourite");
    await button("Save style").click();
    let savedStyles = await page.evaluate(() => JSON.parse(localStorage.getItem("contour-studio.styles.v1")));
    const presetId = savedStyles[0].id;
    await button("Bold city").click();
    await styleName.fill("  my FAVOURITE  ");
    await button("Replace saved style").click();
    savedStyles = await page.evaluate(() => JSON.parse(localStorage.getItem("contour-studio.styles.v1")));
    assert.equal(savedStyles.length, 1, "replacing a case-insensitive style name keeps a single preset");
    assert.equal(savedStyles[0].id, presetId, "replacement preserves the preset identity");
    assert.equal(savedStyles[0].values.roads, "engraved");
    await button("Natural").click();
    await button("my FAVOURITE").click();
    await waitSetting("roads", "engraved");
    assert.equal((await settings()).building_exaggeration, 3, "applying a replaced style restores its latest choices");

    await open(control("Frame"));
    await control("Frame").selectOption("integrated");
    await open(control("Border width · mm"));
    await control("Border width · mm").fill("4");
    await control("Border width · mm").press("Tab");
    await control("Frame").selectOption("separate");
    await waitSetting("frame_width", 6);
    await page.getByText("Supported slide-in insert", { exact: true }).waitFor();
    assert.equal(await control("Border width · mm").getAttribute("min"), "6");
    await control("Insert clearance · mm").fill("0.3");
    await control("Insert clearance · mm").press("Tab");
    await waitSetting("tolerance", 0.3);
    assert((await page.locator(".frame-fit-summary").innerText()).includes("0.30 mm side clearance"));
    await control("Frame").selectOption("none");
    assert.equal(await button("Fit profile to border").count(), 0, "inactive frame choices do not show profile warnings");

    await open(button("Add a special place"));
    await button("Add a special place").click();
    await button("Cancel placement").click();
    await control("Place 1 name").fill("   ");
    assert.equal(await control("Place 1 name").getAttribute("aria-invalid"), "true");
    await page.getByText("Give this place a name before generating your model.", { exact: true }).waitFor();
    await control("Place 1 name").fill("Home");
    assert.equal(await control("Place 1 name").getAttribute("aria-invalid"), null);
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "expanded controls fit a mobile viewport");
    assert.deepEqual(errors, []);
    console.log("PASS: repeated numeric edit cancellation, pointer download after invalid-input correction, preset feature resets, saved-style replacement/application, separate-frame fit and clearance, inactive-frame feedback, marker names and mobile overflow; no page errors.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
