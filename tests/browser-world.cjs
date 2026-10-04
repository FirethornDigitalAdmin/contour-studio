const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { reveal } = require('./ui-helpers.cjs');
const url = process.env.APP_URL || 'http://127.0.0.1:8765';
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);
    await page.getByRole('button', { name: 'Choose location', exact: true }).click();
    const draft=async()=>page.evaluate(()=>JSON.parse(localStorage.getItem('contour-studio.draft.v1')).settings);
    async function search(value) {
      await page.getByLabel('Search for a place',{exact:true}).fill(value);
      await page.getByRole('button',{name:'Search',exact:true}).click();
      await page.locator('.search-results button').first().click();
      await page.waitForFunction(()=>!document.querySelector('.search-results'));
      await page.waitForTimeout(450);
    }
    await search('-17, 179.999');
    let s=await draft();
    assert(s.bounds.east<s.bounds.west,'date-line location wraps its bounds');
    const rect=await page.locator('.selection-box').boundingBox();
    const host=await page.locator('.map-host').boundingBox();
    assert(rect.width>20 && rect.width<host.width,'date-line selection has a local-sized visible box');
    // Move across the world-copy boundary while keeping the area visible.
    const move=page.getByRole('button',{name:'Move selected area',exact:true});
    await move.focus();
    for(let i=0;i<8;i++)await page.keyboard.press('ArrowRight');
    const moved=await page.locator('.selection-box').boundingBox();
    assert(moved.x>host.x-20 && moved.x<host.x+host.width,'moving past 180 keeps the selection visible');
    await page.screenshot({path:'data/world-date-line.png'});
    await page.getByRole('button',{name:'Add details',exact:true}).click();
    const addPlace = page.getByRole('button',{name:'Add a special place',exact:true,includeHidden:true});
    await reveal(page, addPlace);
    await addPlace.click();
    await page.getByRole('button',{name:'Cancel placement',exact:true}).click();
    await page.waitForTimeout(400);
    s=await draft();
    assert(Math.abs(s.markers[0].lon)>179,'marker centre follows the date-line location');
    assert(!(await page.locator('body').innerText()).includes('outside your selected area'));
    await page.locator('.stepper').getByRole('button', { name: /Location/ }).click();
    await search('90, 12');
    await page.getByText('Polar coordinate view',{exact:true}).waitFor();
    s=await draft();assert(s.bounds.north<=90 && s.bounds.north>89.99);
    const before=s.bounds.south;
    await page.getByRole('button',{name:'Move polar area south',exact:true}).click();
    await page.waitForTimeout(400);s=await draft();assert(s.bounds.south<before);
    await page.getByRole('button',{name:'Smaller polar area',exact:true}).click();
    await page.screenshot({path:'data/world-polar-desktop.png'});
    // Symbols must still be placeable in Style, when moving the crop is locked.
    await page.getByRole('button',{name:'Add details',exact:true}).click();
    await reveal(page, addPlace);
    await addPlace.click();
    const polarSelection = page.locator('.polar-selection');
    const selectionBounds = await polarSelection.boundingBox();
    await page.mouse.click(selectionBounds.x + selectionBounds.width * .65, selectionBounds.y + selectionBounds.height * .4);
    await page.waitForFunction(()=>!document.querySelector('.placement-note'));
    await page.waitForTimeout(400);
    s=await draft();
    assert(s.markers.at(-1).lat > (s.bounds.north+s.bounds.south)/2,'polar symbol moves to the chosen position in Style');
    await addPlace.click();
    await polarSelection.focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(()=>!document.querySelector('.placement-note'));
    await page.waitForTimeout(400);
    s=await draft();
    assert(Math.abs(s.markers.at(-1).lat - (s.bounds.north+s.bounds.south)/2)<1e-8,'keyboard can place a polar symbol at the centre');
    await page.locator('.stepper').getByRole('button', { name: /Location/ }).click();
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Move polar area north',exact:true}).click();
    await page.screenshot({path:'data/world-polar-mobile.png'});
    assert.deepEqual(errors,[]);
    console.log('PASS: real coordinate search, date-line bounds/visible movement/marker centre, polar selection, pointer/keyboard symbol placement in Style and mobile controls; no page errors.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
