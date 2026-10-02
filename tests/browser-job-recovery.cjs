// Deterministic browser checks; job responses are controlled, other app routes are real.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const url = process.env.APP_URL || "http://127.0.0.1:8765";

(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    const defaults = await (await page.request.get(url + "/api/preset")).json();
    const running = {
      id: "recovery-test", status: "running", progress: 37, message: "Building recovery terrain",
      settings: { ...defaults, name: "Recovered artwork" },
    };
    let active = running;
    let interrupted = false;
    await page.route("**/api/active-job", (route) => route.fulfill({ json: active }));
    await page.route("**/api/jobs/recovery-test", (route) => route.fulfill(
      interrupted ? { status: 404, json: { detail: "Project not found." } } : { json: running },
    ));
    await page.route("**/api/generate", (route) => {
      active = running;
      return route.fulfill({ status: 409, json: { detail: "A model is already being generated." } });
    });
    await page.goto(url);
    await page.getByText("Building recovery terrain", { exact: true }).first().waitFor();
    assert(await page.getByRole("heading", { name: "Recovered artwork", exact: true }).isVisible());
    await page.reload();
    await page.getByText("Building recovery terrain", { exact: true }).first().waitFor();
    assert(await page.getByRole("heading", { name: "Recovered artwork", exact: true }).isVisible());

    active = null;
    await page.reload();
    await page.getByRole("button", { name: "3 Make", exact: true }).click();
    await page.getByRole("button", { name: "Generate model", exact: true }).click();
    await page.getByText("Building recovery terrain", { exact: true }).first().waitFor();
    assert(await page.getByRole("heading", { name: "Recovered artwork", exact: true }).isVisible());

    interrupted = true;
    await page.getByRole("alert").filter({ hasText: /Generation was interrupted when the app stopped/ }).waitFor();
    assert(await page.getByRole("button", { name: "Try generating again", exact: true }).isEnabled());
    assert(await page.getByRole("heading", { name: "Recovered artwork", exact: true }).isVisible());
    assert.deepEqual(errors, []);
    console.log("PASS: refresh recovery, another-tab conflict recovery, interrupted-job retry; no page errors.");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
