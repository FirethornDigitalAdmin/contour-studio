// Project creation, editing, type changes and recovery against the local API.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const url = process.env.APP_URL || 'http://127.0.0.1:5178';
const output = 'data/project-ux-review';
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Don't attach to someone else's generation while checking the editor.
    await page.route('**/api/active-job', route => route.fulfill({ json: null }));
    const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
    const nav = name => button(name, page.getByRole('navigation', { name: 'Edit your artwork' }));
    const feature = name => page.locator('.feature-group').filter({ has: page.locator('.feature-group-heading strong').getByText(name, { exact: true }) });
    const draft = async () => {
      await page.waitForFunction(() => document.querySelector('.design-status')?.textContent.includes('All changes saved'));
      // Read the debounce result only once the expected current controls are saved.
      await page.waitForTimeout(450);
      return page.evaluate(() => JSON.parse(localStorage.getItem('contour-studio.draft.v1')));
    };
    const create = async (type, content) => {
      await button('Projects home').click();
      await button('New project', page.locator('.project-start')).click();
      await page.locator('.project-type-cards button').filter({ hasText: type }).click();
      if (content) await button(content).click();
      await button('Create project').click();
      await page.getByRole('heading', { name: 'Choose your place.', exact: true }).waitFor();
    };
    await page.goto(url);
    await page.getByRole('heading', { name: 'A place worth making.', exact: true }).waitFor();
    await page.screenshot({ path: `${output}/home-desktop.png` });
    await create('Single map');
    assert.equal(await page.locator('.stepper button').count(), 3);
    await button('Edinburgh', page.locator('.starter-places')).click();
    const original = (await draft()).settings;
    await page.getByRole('group', { name: 'Artwork sizes' }).getByRole('button', { name: /^Medium/ }).click();
    await page.waitForFunction(() => { const box = document.querySelector('.selection-box')?.getBoundingClientRect(); return box && Math.abs(box.width / box.height - 380 / 280) < .01; });
    const resized = (await draft()).settings;
    assert.equal(resized.width, 400);
    assert.equal(resized.height, 300);
    assert.notDeepEqual(resized.bounds, original.bounds);
    assert.equal(await page.locator('.workspace').getAttribute('data-step'), 'place');
    assert(await page.getByRole('button', { name: 'Move box', exact: true }).isVisible());
    await button('Undo design change').click();
    assert.deepEqual((await draft()).settings.bounds, original.bounds);
    await nav('Design').click();
    assert.equal(await page.getByRole('group', { name: 'Artwork sizes' }).count(), 0);

    assert.equal(await feature('Buildings').getByRole('button', { name: 'Edit details' }).getAttribute('aria-expanded'), 'false');
    await feature('Buildings').getByRole('button', { name: 'Edit details' }).click();
    await feature('Buildings').getByRole('spinbutton', { name: 'Building height multiplier' }).fill('2.7');
    await feature('Buildings').getByRole('spinbutton', { name: 'Building height multiplier' }).press('Tab');
    await feature('Buildings').getByRole('switch', { name: 'Buildings', exact: true }).uncheck();
    await nav('Place').click();
    await nav('Design').click();
    await feature('Buildings').getByRole('switch', { name: 'Buildings', exact: true }).check();
    await feature('Buildings').getByRole('button', { name: 'Edit details' }).click();
    assert.equal(await feature('Buildings').getByRole('spinbutton', { name: 'Building height multiplier' }).inputValue(), '2.7');
    await feature('Buildings').getByRole('button', { name: 'Hide details' }).click();
    await button('Frame', page.getByRole('group', { name: 'Quick edit' })).click();
    assert.equal(await feature('Frame & caption').getByRole('button', { name: 'Hide details' }).getAttribute('aria-expanded'), 'true');
    await feature('Frame & caption').getByLabel('Frame', { exact: true }).selectOption('separate');
    await feature('Frame & caption').getByRole('switch').uncheck();
    await feature('Frame & caption').getByRole('switch').check();
    assert.equal(await feature('Frame & caption').getByLabel('Frame', { exact: true }).inputValue(), 'separate');
    await nav('Print').click();
    await page.getByRole('heading', { name: 'Prepare every piece.', exact: true }).waitFor();
    assert(await page.locator('.printer-presets').isVisible());
    const single = await draft();
    assert.equal(single.settings.name, 'Edinburgh');
    assert.equal(single.settings.building_exaggeration, 2.7);
    assert.equal(single.settings.project_type, 'single');
    const valid = await page.request.post(`${url}/api/validate`, { data: single.settings });
    assert(valid.ok(), await valid.text());
    await nav('Design').click();
    await page.screenshot({ path: `${output}/design-desktop.png` });
    // New projects retain the previous draft in the project library.
    await create('Modular wall', 'Different places');
    assert.equal(await page.locator('.tile-location-list button').count(), 4);
    await page.locator('.tile-location-list button').nth(1).click();
    await button('Chamonix', page.locator('.starter-places')).click();
    await nav('Design').click();
    await button('Size & layout', page.getByRole('group', { name: 'Quick edit' })).click();
    const beforeGrowth = await draft();
    await button('Artwork layout', page.getByRole('group', { name: 'Workspace view' })).click();
    await button('Add column').click();
    const afterGrowth = await draft();
    assert.equal(afterGrowth.settings.map_tiles[3].id, beforeGrowth.settings.map_tiles[2].id);
    assert.equal(afterGrowth.settings.map_tiles[4].id, beforeGrowth.settings.map_tiles[3].id);
    assert.equal(await page.locator('.tile-location-list button').count(), 6);
    await page.locator('.collection-layout svg g').nth(0).click();
    await button('Edinburgh', page.locator('.starter-places')).click();
    await page.locator('.tile-location-list button').nth(1).click();
    assert.equal(await page.locator('.current-place strong').innerText(), 'Chamonix');
    const wall = await draft();
    assert.equal(wall.settings.map_tiles[0].name, 'Edinburgh');
    assert.equal(wall.settings.map_tiles[1].name, 'Chamonix');
    assert.equal(wall.settings.project_type, 'modular');
    assert((await page.request.post(`${url}/api/validate`, { data: wall.settings })).ok());
    await page.getByRole('button', { name: /Modular wall · Change type/ }).click();
    await page.locator('.project-type-cards button').filter({ hasText: 'Single map' }).click();
    await button('Apply project type').click();
    assert.equal((await draft()).settings.map_format, 'artwork');
    await button('Undo design change').click();
    assert.equal((await draft()).settings.map_format, 'mini_tiles');
    await page.getByRole('button', { name: /Modular wall · Change type/ }).click();
    await button('One continuous map').click();
    await button('Apply project type').click();
    assert.equal((await draft()).settings.map_format, 'artwork');
    await page.getByRole('button', { name: /Modular wall · Change type/ }).click();
    await button('Different places').click();
    await button('Apply project type').click();
    const returned = await draft();
    assert.equal(returned.settings.map_tiles[0].name, 'Edinburgh');
    assert.equal(returned.settings.map_tiles[1].name, 'Chamonix');
    await create('Jigsaw puzzle');
    await nav('Design').click();
    await button('Size & layout', page.getByRole('group', { name: 'Quick edit' })).click();
    await page.getByText('Custom grid & relief', { exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Puzzle columns' }).fill('5');
    await page.getByRole('spinbutton', { name: 'Puzzle columns' }).press('Tab');
    const puzzle = await draft();
    assert.equal(puzzle.settings.puzzle_columns, 5);
    assert((await page.request.post(`${url}/api/validate`, { data: puzzle.settings })).ok());
    await button('Projects home').click();
    assert.equal(await page.locator('.recent-design').filter({ hasText: 'Design saved' }).count(), 3);
    await page.locator('.recent-design').filter({ hasText: 'Single map' }).filter({ hasText: 'Design saved' }).click();
    assert.equal((await draft()).settings.building_exaggeration, 2.7);
    assert.equal((await draft()).settings.name, 'Edinburgh');
    // Reload starts at Projects, preserving the current editable design.
    await page.reload();
    await button('Continue last project').click();
    assert.equal((await draft()).settings.name, 'Edinburgh');
    for (const width of [900, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      for (const tab of ['Place', 'Design', 'Print']) {
        await nav(tab).click();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px ${tab} should not overflow`);
        assert(await nav('Place').isVisible());
        assert(await nav('Design').isVisible());
        assert(await nav('Print').isVisible());
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await nav('Place').click();
    assert(await page.getByRole('group', { name: 'Artwork sizes' }).getByRole('button', { name: /^Medium/ }).isVisible());
    await page.screenshot({ path: `${output}/place-size-mobile.png`, fullPage: true });
    await nav('Design').click();
    await page.screenshot({ path: `${output}/design-mobile.png`, fullPage: true });
    await button('Projects home').click();
    await button('New project', page.locator('.project-start')).click();
    await page.locator('.project-type-cards button').filter({ hasText: 'Modular wall' }).click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${output}/chooser-mobile.png` });
    await page.keyboard.press('Escape');
    // Old five-step drafts remain resumable in the new workspace.
    for (const [oldStep, newStep] of [[0, 0], [1, 0], [2, 1], [3, 1], [4, 2]]) {
      const legacyContext = await browser.newContext();
      const legacy = await legacyContext.newPage();
      await legacy.route('**/api/active-job', route => route.fulfill({ json: null }));
      await legacy.addInitScript(({ settings, oldStep }) => localStorage.setItem('contour-studio.draft.v1', JSON.stringify({ version: 1, workflowVersion: 2, settings, step: oldStep, view: 'map' })), { settings: single.settings, oldStep });
      await legacy.goto(url);
      await legacy.getByRole('button', { name: 'Continue last project', exact: true }).click();
      await legacy.waitForFunction(expected => document.querySelector('.workspace')?.getAttribute('data-step') === expected, ['place', 'design', 'print'][newStep]);
      await legacyContext.close();
    }
    assert.deepEqual(errors, []);
    console.log('PASS: project creation, toggles/detail preservation, three-tab navigation, real API validation, tile editing/growth, type changes/undo, draft library/reload, five-step migration, 900/390/320px layouts and no browser errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
