// Exercise the free static site without a Python server or mock generation.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { reveal } = require('./ui-helpers.cjs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const errors = [], apiRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url()); });
  const button = name => page.getByRole('button', { name, exact: true });
  const save = async () => {
    const saveButton = page.locator('.sidebar').getByRole('button',{name:'Save settings',exact:true,includeHidden:true});
    await reveal(page, saveButton);
    const pending = page.waitForEvent('download');
    await saveButton.click();
    const download = await pending;
    return JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  };
  try {
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:4173');
    await button('Make it yours').waitFor();
    await page.locator('.maplibregl-canvas').waitFor();
    assert.equal(await page.locator('.project-heading h2').innerText(), 'Keswick');
    await page.getByLabel('Width · mm', { exact: true }).fill('450');
    await button('Chamonix').click();
    assert.equal((await save()).width, 450, 'suggested places preserve the artwork settings');
    await page.getByLabel('Search for a place', { exact: true }).fill('35.68, 139.76');
    await button('Search').click();
    await page.locator('.search-results button').click();
    const design = await save();
    assert.equal(design.name, '35.68°');
    assert(Math.abs((design.bounds.north + design.bounds.south) / 2 - 35.68) < .001);
    await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"terrain_style":"broken"}') });
    await page.getByRole('alert').waitFor();
    assert.equal((await save()).width, 450);
    await button('Dismiss error').click();
    await page.locator('input[type=file]').setInputFiles({ name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...design, name: 'My landscape' })) });
    await page.waitForFunction(() => document.querySelector('.project-heading h2')?.textContent === 'My landscape');
    await page.waitForTimeout(500);
    await page.reload();
    await button('Make it yours').waitFor();
    assert.equal(await page.locator('.project-heading h2').innerText(), 'My landscape');
    await button('Make it yours').click();
    await button('Review & make').click();
    await button('Continue to local printing').click();
    await page.getByRole('dialog', { name: 'From map to mantelpiece.' }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog[open]').count(), 0);
    for (const [width, height] of [[390,844], [768,900], [1440,1000]]) {
      await page.setViewportSize({ width, height });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px layout fits`);
      const footer = await page.locator('.workflow-footer').boundingBox();
      assert(footer.y >= 0 && footer.y + footer.height <= height + 1, 'main action stays visible');
    }
    await button('Back').click(); await button('Back').click();
    await button('Keswick').click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'data/ux-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'data/ux-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    assert.deepEqual(apiRequests, [], 'hosted workspace never calls the local generation API');
    console.log('PASS: static startup, suggested places, coordinate search, validated imports, export, draft recovery, local printing handoff, keyboard dialog and mobile/tablet/desktop layout; no page errors or local API requests.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
