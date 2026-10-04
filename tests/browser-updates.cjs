// Rendered update discovery, retry and release-note safety checks.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const url = process.env.APP_URL || 'http://127.0.0.1:18867';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const info = { desktop: true, current_version: '1.0.0-rc.2', releases_url: 'https://github.com/FirethornDigitalAdmin/contour-studio/releases' };
  let state = 'available', checks = 0;
  await page.route('**/api/updates', route => route.fulfill({ json: info }));
  await page.route('**/api/updates/check', route => {
    checks++;
    return state === 'offline' ? route.fulfill({ status: 503, json: { detail: 'Offline' } }) : route.fulfill({ json: { ...info, status: state,
      latest_version: '1.0.0-rc.3', release_notes: 'Better maps\n<script>window.badUpdate = true</script>',
      release_url: info.releases_url + '/tag/v1.0.0-rc.3',
      download_url: info.releases_url + '/download/v1.0.0-rc.3/Contour-Studio-macOS-arm64.dmg' } });
  });
  try {
    await page.addInitScript(() => {
      let state = { status: 'idle' };
      window.nativeRestarts = 0;
      window.pywebview = { api: {
        install_update: async () => { state = { status: 'downloading', progress: 45 }; return state; },
        update_status: async () => { const previous = state; state = { status: 'ready', message: 'Ready to restart' }; return previous; },
        restart_for_update: async () => { window.nativeRestarts++; return { status: 'installing', message: 'Installing and restarting…' }; }
      } };
    });
    await page.goto(url);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Update available', exact: true }).waitFor();
    assert.equal(checks, 1, 'background check runs once');
    assert.equal(await page.locator('.update-dialog').isVisible(), false, 'startup does not interrupt the user');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Projects home', exact: true }).click();
    await page.getByRole('heading', { name: 'Your projects', exact: true }).waitFor();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('contour:menu', { detail: 'design' })));
    await page.locator('.step.active').filter({ hasText: 'Design' }).waitFor();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('contour:menu', { detail: 'place' })));
    await page.locator('.step.active').filter({ hasText: 'Place' }).waitFor();
    const saved = page.waitForEvent('download');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('contour:menu', { detail: 'save-design' })));
    const download = await saved;
    assert.equal(download.suggestedFilename(), 'contour-settings.json');
    const chooser = page.waitForEvent('filechooser');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('contour:menu', { detail: 'import-design' })));
    await (await chooser).setFiles(await download.path());
    await page.locator('.step.active').filter({ hasText: 'Design' }).waitFor();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('contour:menu', { detail: 'help' })));
    await page.locator('dialog[aria-labelledby="help-title"]').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Update available', exact: true }).click();
    assert.equal(await page.locator('dialog[aria-labelledby="help-title"]').isVisible(), false, 'menu switches safely between dialogs');
    await page.getByRole('button', { name: 'Download & install', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Download update', exact: true }).count(), 0, 'update uses the native installer rather than a browser download');
    assert.equal(await page.evaluate(() => window.badUpdate), undefined, 'release notes are plain text');
    assert.match(await page.locator('.update-notes').innerText(), /<script>/);
    fs.mkdirSync('data/ui-review', { recursive: true });
    await page.screenshot({ path: 'data/ui-review/update-available.png' });
    state = 'offline';
    await page.getByRole('button', { name: 'Check again', exact: true }).click();
    await page.getByText('Couldn’t check for updates.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Download & install', exact: true }).count(), 0, 'failed check does not retain an old download');
    state = 'current';
    await page.getByRole('button', { name: 'Check again', exact: true }).click();
    await page.getByText('You’re up to date with releases available for your computer.', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.update-dialog').isVisible(), false);
    assert.equal(await page.getByRole('button', { name: 'Check for updates', exact: true }).evaluate(el => el === document.activeElement), true, 'focus returns to update button');
    await page.setViewportSize({ width: 900, height: 650 });
    await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
    await page.getByText('You’re up to date with releases available for your computer.', { exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'small window has no page overflow');
    await page.screenshot({ path: 'data/ui-review/update-current-small.png' });
    await page.keyboard.press('Escape');
    state = 'available';
    await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
    await page.getByRole('button', { name: 'Download & install', exact: true }).click();
    await page.getByText('Downloading update · 45%', { exact: true }).waitFor();
    await page.getByText('Installing and restarting…', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.nativeRestarts), 1, 'installer restarts once after staging');
    await page.keyboard.press('Escape');
    await page.unroute('**/api/updates');
    await page.route('**/api/updates', route => route.fulfill({ json: { ...info, desktop: false } }));
    await page.reload();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'How it works', exact: true }).waitFor();
    assert.equal(await page.locator('.update-button').count(), 0, 'browser-only workspace hides desktop updates');
    assert.deepEqual(errors, []);
    console.log('PASS: background check, download, plain-text notes, offline retry, current version, keyboard focus, small window and desktop-only visibility.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
