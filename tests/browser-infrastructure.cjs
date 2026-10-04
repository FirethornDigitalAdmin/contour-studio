const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { reveal } = require('./ui-helpers.cjs');
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({baseURL:process.env.APP_URL || 'http://127.0.0.1:8796',viewport:{width:1440,height:1000},acceptDownloads:true});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const read=async()=>{
    const button=page.locator('.sidebar').getByRole('button',{name:'Save settings',exact:true,includeHidden:true});
    await reveal(page,button); const download=page.waitForEvent('download'); await button.click();
    return JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));
  };
  try {
    await page.goto('/');
    await page.getByRole('button',{name:'Make it yours',exact:true}).click();
    const add=page.getByRole('button',{name:'Add transport & city detail',exact:true,includeHidden:true});
    await reveal(page,add); await add.click();
    let s=await read();
    for(const k of ['railways','road_hierarchy','urban_spaces','supported_crossings','preserve_building_gaps','building_type_heights']) assert.equal(s[k],true,k);
    const crossings=page.getByRole('checkbox',{name:'Supported crossings & hidden tunnels',exact:true,includeHidden:true});
    await reveal(page,crossings); await crossings.uncheck();
    s=await read(); assert.equal(s.supported_crossings,false);
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('contour-studio.draft.v1')||'{}').settings?.supported_crossings===false);
    await page.reload(); await page.getByText('Map features',{exact:true}).waitFor();
    s=await read(); assert.equal(s.supported_crossings,false);
    await reveal(page,crossings); await crossings.check();
    s=await read(); assert.equal(s.supported_crossings,true);
    const openings=page.getByRole('checkbox',{name:'Simple bridge openings',exact:true,includeHidden:true});
    await reveal(page,openings); await openings.uncheck();
    s=await read(); assert.equal(s.bridge_openings,false);
    await openings.check(); s=await read(); assert.equal(s.bridge_openings,true);
    const treatment=page.getByLabel('Railway treatment',{exact:true});
    await reveal(page,treatment); await treatment.selectOption('bed');
    await page.getByLabel('Track bed width · mm',{exact:true}).fill('4');
    s=await read(); assert.equal(s.railway_style,'bed');assert.equal(s.railway_width,4);
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('contour-studio.draft.v1')||'{}').settings?.railway_width===4);
    await page.reload(); await page.getByText("Map features",{exact:true}).waitFor(); s=await read();assert.equal(s.railway_width,4);assert.equal(s.railways,true);assert.equal(s.bridge_openings,true);
    for(const width of [390,768,1440]){
      await page.setViewportSize({width,height:1000}); await reveal(page,treatment);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:`data/infrastructure-controls-${width}.png`});
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: transport controls, physical dimensions, save/reload and mobile/tablet/desktop layout; no page errors.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
