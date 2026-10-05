const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173');
    await page.getByRole('button',{name:'Assets',exact:true}).click();
    await page.getByRole('heading',{name:'Small pieces. More possibilities.'}).waitFor();
    const catalogue=page.getByRole('region',{name:'Reusable assets'});
    assert.equal(await catalogue.getByRole('button').count(),6);
    fs.mkdirSync('data/assets-review',{recursive:true});
    for (const name of ['Joining key','Joining plate','Mounting plate','Square blank + base','Hexagonal blank + base','Custom plaque']) {
      await catalogue.getByRole('button',{name:new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).click();
      if(name==='Custom plaque') await page.getByRole('textbox',{name:'Plaque text'}).fill('Bolton upon Dearne 2026');
      const pending=page.waitForEvent('download');
      await page.getByRole('button',{name:name.includes('blank')?'Download blank STL':'Download STL',exact:true}).click();
      const download=await pending; await download.saveAs(`data/assets-review/browser-${download.suggestedFilename()}`);
      const bytes=fs.readFileSync(`data/assets-review/browser-${download.suggestedFilename()}`);
      assert.equal(bytes.length,84+bytes.readUInt32LE(80)*50);
      assert(bytes.readUInt32LE(80)>0);
    }
    const pending=page.waitForEvent('download');
    await page.getByRole('button',{name:'Editable source (.scad)',exact:true}).click();
    const source=await pending; await source.saveAs('data/assets-review/browser-plaque.scad');
    assert(fs.readFileSync('data/assets-review/browser-plaque.scad','utf8').includes('Bolton upon Dearne 2026'));
    await page.getByRole('spinbutton',{name:'Width · mm',exact:true}).fill('0');
    assert.equal(await page.getByRole('button',{name:'Download STL',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Reset dimensions'}).click();
    await page.getByRole('searchbox',{name:'Search assets'}).fill('nothingmatches');
    await page.getByText('No matching assets. Try another search or category.').waitFor();
    await page.getByRole('searchbox',{name:'Search assets'}).fill('');
    await page.getByRole('button',{name:'Blanks',exact:true}).click();
    assert.equal(await catalogue.getByRole('button').count(),2);
    await page.getByRole('button',{name:'All assets',exact:true}).click();
    await page.screenshot({path:'data/assets-review/desktop.png',fullPage:true});
    await page.getByRole('button',{name:'Projects home',exact:true}).click();
    await page.getByRole('button',{name:'Assets',exact:true}).click();
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert(await page.locator(".assets-page").evaluate(e=>e.scrollWidth<=e.clientWidth));
    await page.screenshot({path:'data/assets-review/mobile.png',fullPage:true});
    await page.reload(); await page.getByRole('button',{name:'Assets',exact:true}).click();
    assert.equal(await page.getByRole('spinbutton',{name:'Width · mm',exact:true}).inputValue(),'10');
    assert.deepEqual(errors,[]);
    console.log('PASS: six STL downloads, editable plaque source, validation, search, filters, navigation, saved options, desktop/mobile layout and no browser errors.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
