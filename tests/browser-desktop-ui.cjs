// Desktop navigation, progressive disclosure, settings recovery and small-window use.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { reveal } = require('./ui-helpers.cjs');
const url = process.env.APP_URL || 'http://127.0.0.1:8765';
const output = process.env.UI_EVIDENCE_DIR || 'data/ui-review';
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ baseURL: url, viewport: { width: 1366, height: 768 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const button = name => page.getByRole('button', { name, exact: true, includeHidden: true });
  const group = name => page.getByText(name, { exact: true }).locator('xpath=ancestor::details[1]');
  const screenshot = name => page.screenshot({ path: path.join(output, name + '.png') });
  const fits = async label => {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: no page overflow`);
    for (const selector of ['.header', '.workflow-footer']) {
      const bounds = await page.locator(selector).boundingBox();
      const size = page.viewportSize();
      assert(bounds.x >= -1 && bounds.x + bounds.width <= size.width + 1, `${label}: ${selector} fits`);
      assert(bounds.y >= -1 && bounds.y + bounds.height <= size.height + 1, `${label}: ${selector} stays visible`);
    }
    if (page.viewportSize().width >= 801) {
      const canvas = page.locator('.map-view, .preview').first();
      if (await canvas.count()) {
        const bounds = await canvas.boundingBox();
        const footer = await page.locator('.workflow-footer').boundingBox();
        assert(bounds.y + bounds.height <= footer.y + 1, `${label}: canvas controls clear the action bar`);
      }
    }
    for (const selector of ['.brand', '.stepper', '.header-tools']) {
      const bounds = await page.locator(selector).boundingBox();
      assert(bounds.x >= -1 && bounds.x + bounds.width <= page.viewportSize().width + 1, `${label}: header items fit`);
    }
  };
  try {
    await page.goto(url);
    await button('Make it yours').waitFor();
    await page.locator('.maplibregl-canvas').waitFor();
    await fits('Place');
    await screenshot('01-place-desktop');
    await button('Make it yours').click();
    assert.equal(await page.locator('details[name="style-options"][open]').count(), 0, 'specialist settings start closed');
    for (const name of ['Land contours', 'Map features', 'Print colours', 'Frame & caption', 'Special places']) {
      assert(await group(name).locator(':scope > summary .section-icon svg').isVisible(), `${name} has an icon`);
      assert((await group(name).locator(':scope > summary small').innerText()).length > 0, `${name} shows the current choice`);
    }
    await screenshot('02-style-desktop');
    // Native summaries support Enter and disclose just one main group at a time.
    const terrainSummary = group('Land contours').locator(':scope > summary');
    await terrainSummary.focus();
    await page.keyboard.press('Enter');
    assert(await group('Land contours').evaluate(element => element.open));
    await page.getByLabel('Height multiplier', { exact: true }).fill('4');
    await page.getByLabel('Height multiplier', { exact: true }).press('Tab');
    await group('Frame & caption').locator(':scope > summary').click();
    assert.equal(await page.locator('details[name="style-options"][open]').count(), 1, 'one main group at a time');
    assert.equal(await group('Land contours').evaluate(element => element.open), false);
    await button('Slim').click();
    await group('Land contours').locator(':scope > summary').click();
    assert.equal(await page.getByLabel('Height multiplier', { exact: true }).inputValue(), '4', 'closing a group preserves edits');
    await group('Land contours').locator(':scope > summary').click();
    await button('How it works').click();
    await page.getByRole('dialog', { name: 'From map to mantelpiece.' }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    for (const size of [{width:1920,height:1080}, {width:1280,height:720}, {width:1024,height:576}, {width:900,height:650}, {width:390,height:844}]) {
      await page.setViewportSize(size);
      await fits(`${size.width}×${size.height}`);
      await button('Review & make').click();
      await fits('Make');
      assert(await button('Generate model').isEnabled(), 'design is ready for local generation');
      await button('Back').click();
    }
    await page.setViewportSize({width:900,height:650});
    await page.locator('.sidebar').evaluate(element => element.scrollTo({top:0}));
    await screenshot('03-style-small-desktop');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('contour-studio.draft.v1') || '{}').settings?.exaggeration === 4);
    await page.reload();
    await page.getByText('Land contours', { exact: true }).waitFor();
    await group('Land contours').locator(':scope > summary').click();
    assert.equal(await page.getByLabel('Height multiplier', { exact: true }).inputValue(), '4');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('contour-studio.draft.v1') || '{}').settings?.frame_width === 6);
    // An unfinished invalid frame is recoverable and review opens the correct controls.
    await page.addInitScript(() => {
      const key = 'contour-studio.draft.v1';
      const draft = JSON.parse(localStorage.getItem(key));
      draft.settings.frame_mode = 'separate'; draft.settings.frame_width = 4; draft.settings.joints = true;
      draft.step = 2; draft.view = '3d';
      localStorage.setItem(key, JSON.stringify(draft));
    });
    await page.reload();
    await button('Review settings').click();
    await page.getByLabel('Border width · mm', { exact: true }).waitFor();
    assert(await group('Frame & caption').evaluate(element => element.open));
    await page.getByLabel('Border width · mm', {exact:true}).fill('6');
    await button('Review & make').click();
    assert(await button('Generate model').isEnabled(), 'review recovers a blocked design');
    await screenshot('04-review-small-desktop');
    if (process.env.UI_GENERATE === '1') {
      const defaults = await (await page.request.get('/api/preset')).json();
      const sample = { ...defaults, name: `Desktop UI check ${Date.now()}`, width:120, height:90,
        resolution:64, buildings:false, roads:'none', water:false, forests:false, fields:false,
        markers:[], marker:false, joints:false, labels:false, multicolour:process.env.UI_COLOUR_FAILURE === '1', frame_mode:'integrated' };
      await reveal(page, page.locator('.sidebar input[type=file]'));
      await page.locator('.sidebar input[type=file]').setInputFiles({name:'desktop-check.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(sample))});
      await button('3 Make').click();
      const generated = page.waitForResponse(response => response.url().endsWith('/api/generate') && response.request().method() === 'POST');
      await button('Generate model').click();
      const response = await generated;
      assert.equal(response.status(), 202);
      let job = await response.json();
      if (process.env.UI_COLOUR_FAILURE === '1') {
        await button('Use single-colour printing').waitFor({timeout:120000});
        await button('Use single-colour printing').click();
        const retry = page.waitForResponse(response => response.url().endsWith('/api/generate') && response.request().method() === 'POST');
        await button('Try generating again').click();
        job = await (await retry).json();
        console.log('PASS: real colour-export failure offers single-colour recovery and keeps the design.');
      }
      fs.writeFileSync(path.join(output, 'preview-job.txt'), job.id);
      const download = page.getByRole('link', {name:'Download print pack',exact:true});
      await download.waitFor({timeout:120000});
      await page.locator('.preview canvas').waitFor({timeout:60000});
      await page.locator('.canvas-message').waitFor({state:'hidden',timeout:60000});
      assert(await button('Save image').isEnabled(), 'real model preview has loaded');
      const pending = page.waitForEvent('download'); await download.click();
      const pack = await pending;
      const bytes = fs.readFileSync(await pack.path());
      assert.equal(bytes.subarray(0,2).toString(),'PK','real print pack downloads');
      await page.setViewportSize({width:1366,height:768});
      await page.locator('.sidebar').evaluate(element => element.scrollTo({top:0}));
      await page.locator('.main').evaluate(element => element.scrollTo({top:0}));
      await screenshot('05-generated-model');
      console.log(`PASS: real UI import → generation → 3D preview → validated print-pack download (${job.id}).`);
    }
    assert.equal(await page.locator('vite-error-overlay').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: compact icon groups, live summaries, keyboard use, one open group, edit persistence, Help, responsive desktop/scaled-laptop/mobile layouts, draft reload and direct validation recovery; no page errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
