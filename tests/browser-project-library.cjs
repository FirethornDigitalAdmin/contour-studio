// Library navigation and generated files remain accessible after consolidating Files.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const url = process.env.APP_URL || 'http://127.0.0.1:18871';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/active-job', route => route.fulfill({ json: null }));
    const projects = await (await page.request.get(`${url}/api/projects`)).json();
    assert(projects.length, 'verification needs an existing generated artwork');
    const project = projects[0];
    const job = await (await page.request.get(`${url}/api/jobs/${project.id}`)).json();
    await page.addInitScript(({ project, job }) => {
      const settings = { ...job.result.settings, name: 'Library verification' };
      const design = { id: 'library-check', updated: new Date().toISOString(), settings, jobId: project.id, step: 1, view: '3d', mapRatioLocked: true };
      localStorage.setItem('contour-studio.designs.v1', JSON.stringify([design, { ...design, id: 'older-copy', updated: '2020-01-01T00:00:00Z' }]));
      localStorage.removeItem('contour-studio.draft.v1');
    }, { project, job });
    await page.goto(url);
    await page.getByRole('heading', { name: 'Your projects', exact: true }).waitFor();
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    assert.equal(await nav.getByRole('button', { name: 'Files', exact: true }).count(), 0);
    await page.getByRole('textbox', { name: 'Search projects' }).fill('Library verification');
    assert.equal(await page.locator('.library-project').count(), 1, 'generated artwork and saved design appear once');
    await page.getByRole('button', { name: 'Print files for Library verification' }).click();
    await page.getByRole('heading', { name: 'Prepare every piece.', exact: true }).waitFor();
    assert.equal(await page.locator('.step.active').innerText(), 'Print');
    await page.locator('.print-package').waitFor();
    const file = page.locator('.print-package a[href^="/api/files/"]').first();
    assert((await page.request.get(new URL(await file.getAttribute('href'), url).href)).ok(), 'project print download is reachable');
    await nav.getByRole('button', { name: 'Projects home' }).click();
    await page.getByRole('heading', { name: 'Your projects', exact: true }).waitFor();
    await nav.getByRole('button', { name: 'Current project' }).click();
    await page.getByRole('heading', { name: 'Prepare every piece.', exact: true }).waitFor();
    await nav.getByRole('button', { name: 'Help', exact: true }).click();
    await page.locator('#help-title').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    assert(await nav.getByRole('button', { name: 'Help', exact: true }).evaluate(el => el === document.activeElement));
    await nav.getByRole('button', { name: 'Projects home' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'library fits small screens');
    fs.mkdirSync('data/project-ux-review', { recursive: true });
    await page.screenshot({ path: 'data/project-ux-review/library-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: unified project library, deduplication, print downloads, current-project recovery, Help focus and mobile layout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
