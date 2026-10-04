// Five-step navigation, shared design persistence and legacy draft migration.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const url = process.env.APP_URL || 'http://127.0.0.1:5178';
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/active-job', route => route.fulfill({ json: null }));
    await page.goto(url);
    const title = text => page.getByRole('heading', { name: text, exact: true });
    const nav = name => page.getByRole('navigation', { name: 'Create your artwork' }).getByRole('button', { name: new RegExp(name) });
    const sidebar = page.getByRole('complementary');
    await title('Choose your format.').waitFor(); console.log('Format loaded');
    assert.equal(await page.locator('.stepper button').count(), 5);
    await sidebar.getByRole('button', { name: 'Square' }).click();
    await page.getByRole('button', { name: 'Choose location', exact: true }).click();
    await title('Choose your place.').waitFor(); console.log('Location loaded');
    await page.getByRole('button', { name: 'Edinburgh', exact: true }).click();
    await page.getByRole('button', { name: 'Add details', exact: true }).click();
    await title('Make it yours.').waitFor(); console.log('Details loaded');
    assert.equal(await sidebar.getByText('Frame & caption', { exact: true }).count(), 0);
    await sidebar.getByRole('button', { name: 'Minimal', exact: true }).click();
    await page.getByRole('button', { name: 'Choose frame', exact: true }).click();
    await title('Finish with a frame.').waitFor(); console.log('Frame loaded');
    await sidebar.getByLabel('Frame', { exact: true }).selectOption('none');
    await sidebar.getByText('Map area: 600.0 × 600.0 mm.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Review & make', exact: true }).click();
    await title('Make your artwork.').waitFor(); console.log('Make loaded');
    await sidebar.getByText('Your printer', { exact: true }).waitFor();
    await sidebar.getByText('Tile layout', { exact: true }).waitFor();
    await sidebar.getByText('Joining & print details', { exact: true }).waitFor();
    await sidebar.locator('.review-list').getByRole('button', { name: /^Frame/ }).click();
    await title('Finish with a frame.').waitFor(); console.log('Frame loaded');
    await nav('Format').click();
    assert.equal(await sidebar.getByRole('spinbutton', { name: 'Width · mm', exact: true }).inputValue(), '600');
    await nav('Location').click();
    assert.equal(await page.locator('.current-place strong').innerText(), 'Edinburgh');
    await nav('Frame').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('contour-studio.draft.v1'))?.step === 3);
    const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('contour-studio.draft.v1')));
    assert.equal(draft.settings.frame_mode, 'none');
    assert.equal(draft.settings.building_style, 'uniform');
    await page.reload();
    await title('Finish with a frame.').waitFor(); console.log('Frame loaded');
    for (const [oldStep, heading] of [[0, 'Choose your place.'], [1, 'Make it yours.'], [2, 'Make your artwork.']]) {
      const legacy = await browser.newPage();
      legacy.setDefaultTimeout(10000);
      await legacy.route('**/api/active-job', route => route.fulfill({ json: null }));
      await legacy.addInitScript(({ draft, oldStep }) => localStorage.setItem('contour-studio.draft.v1', JSON.stringify({ version: 1, settings: draft.settings, step: oldStep, view: 'map' })), { draft, oldStep });
      await legacy.goto(url);
      await legacy.getByRole('heading', { name: heading, exact: true }).waitFor();
      await legacy.close();
    }
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('contour:menu', { detail: 'place' })));
    await title('Choose your place.').waitFor();
    for (const [command, heading] of [['format', 'Choose your format.'], ['design', 'Make it yours.'], ['frame', 'Finish with a frame.'], ['make', 'Make your artwork.']]) {
      await page.evaluate(command => window.dispatchEvent(new CustomEvent('contour:menu', { detail: command })), command);
      await title(heading).waitFor();
    }
    await nav('Format').click();
    for (const width of [900, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px layout should not overflow`);
      for (const name of ['Format', 'Location', 'Details', 'Frame', 'Make']) assert(await nav(name).isVisible());
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'data/five-step-backup/format-mobile.png' });
    assert.deepEqual(errors, []);
    console.log('PASS: all five steps, control placement, review links, design preservation, reload, legacy drafts and 900/390/320px layouts.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
