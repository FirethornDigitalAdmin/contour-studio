// Workspace preferences and stale asynchronous responses must preserve the user's current design.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const url = process.env.APP_URL || 'http://127.0.0.1:8765';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ baseURL: url, viewport: { width: 1366, height: 768 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const button = name => page.getByRole('button', { name, exact: true });
  try {
    await page.goto(url);
    await button('Ratio locked').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('contour-studio.draft.v1') || '{}').mapRatioLocked === false);
    await page.reload();
    await button('Free shape').waitFor();
    const original = await page.evaluate(() => JSON.parse(localStorage.getItem('contour-studio.draft.v1')).settings.bounds);
    await button('Square 600 × 600').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('contour-studio.draft.v1')).settings.height === 600);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('contour-studio.draft.v1')).settings.bounds), original, 'recovered free shape keeps the selected crop');

    let releaseSearch, startedSearch;
    const searchStarted = new Promise(resolve => { startedSearch = resolve; });
    const searchReleased = new Promise(resolve => { releaseSearch = resolve; });
    await page.route('**/api/search?*', async route => {
      startedSearch(); await searchReleased;
      await route.fulfill({ json: [{ display_name: 'Outdated result', lat: '1', lon: '1' }] });
    });
    await page.getByLabel('Search for a place', { exact: true }).fill('delayed search');
    await button('Search').click(); await searchStarted;
    await button('Keswick').click(); releaseSearch();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.search-results').count(), 0, 'suggested place cancels earlier search responses');
    assert.equal(await page.locator('.project-heading h2').innerText(), 'Keswick');

    await page.route('**/api/projects', route => route.fulfill({ json: [{ id: 'missing-artwork', name: 'Missing artwork', created_at: '2026-10-02T12:00:00Z', layout: { columns: 1, rows: 1 } }] }));
    await button('My projects').click();
    await page.getByRole('button', { name: /^Missing artwork/ }).click();
    await page.getByRole('alert').filter({ hasText: 'Could not open this artwork' }).waitFor();
    assert(await page.getByRole('dialog', { name: 'My projects', exact: true }).isVisible(), 'failed project remains recoverable within the library');
    assert.equal(await page.locator('.project-heading h2').innerText(), 'Keswick', 'failed project leaves current design intact');
    await button('New artwork').click();
    await button('Ratio locked').waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: free-shape reload/crop preservation, stale search cancellation, project-open error recovery and new artwork reset; no page errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
