const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.APP_URL||'http://127.0.0.1:5173');await page.getByRole('button',{name:'Assets',exact:true}).click();
 const catalogue=page.getByRole('region',{name:'Reusable assets'});const download=async(button,path)=>{const event=page.waitForEvent('download');await button.click();await(await event).saveAs(path);};
 fs.mkdirSync('data/assets-review',{recursive:true});
 for(const shape of ['Hexagonal','Square']){
  await catalogue.getByRole('button',{name:new RegExp(`${shape} blank`)}).click();
  for(const [size,width] of [['Small',80],['Medium',100],['Large',140]]){
   await page.getByRole('group',{name:'Blank tile size'}).getByRole('button',{name:new RegExp(size)}).click();
   await download(page.getByRole('button',{name:'Download complete tile kit (.zip)',exact:true}),`data/assets-review/${shape.toLowerCase()}-${width}-download.zip`);
  }
  await download(page.getByRole('button',{name:'Download matching base STL',exact:true}),`data/assets-review/${shape.toLowerCase()}-base-download.stl`);
 }
 await catalogue.getByRole('button',{name:/Custom plaque/}).click();await page.getByRole('textbox',{name:'Plaque text'}).fill('Bolton upon Dearne 2026');
 for(const shape of ['heritage','rounded','oval','shield','rectangle']){
  await page.getByRole('combobox',{name:'Plaque shape'}).selectOption(shape);
  for(const mode of ['Engraved','Raised']){
   await page.getByRole('group',{name:'Plaque lettering'}).getByRole('button',{name:mode,exact:true}).click();
   await download(page.getByRole('button',{name:'Download STL',exact:true}),`data/assets-review/ui-${shape}-${mode.toLowerCase()}.stl`);
  }
  await page.getByRole('button',{name:'AMS multicolour',exact:true}).click();
  await download(page.getByRole('button',{name:'Download colour 3MF',exact:true}),`data/assets-review/ui-${shape}-ams.3mf`);
 }
 await page.getByRole('combobox',{name:'Plaque shape'}).selectOption('heritage');
 await page.locator('input[type=color]').first().fill('#193e58');await page.locator('input[type=color]').nth(1).fill('#f4cf87');
 await download(page.getByRole('button',{name:'Download colour 3MF',exact:true}),'data/assets-review/ui-custom-colours.3mf');
 await download(page.getByRole('button',{name:'Base STL · filament 1',exact:true}),'data/assets-review/ui-ams-base.stl');
 await download(page.getByRole('button',{name:'Lettering STL · filament 2',exact:true}),'data/assets-review/ui-ams-lettering.stl');
 await page.screenshot({path:'data/assets-review/plaque-ams-desktop.png'});
 await page.getByRole('textbox',{name:'Plaque text'}).fill('');assert(await page.getByRole('button',{name:'Download colour 3MF',exact:true}).isDisabled());
 await page.getByRole('textbox',{name:'Plaque text'}).fill('Bolton upon Dearne 2026');
 await page.reload();await page.getByRole('button',{name:'Assets',exact:true}).click();await page.getByRole('region',{name:'Reusable assets'}).getByRole('button',{name:/Custom plaque/}).click();
 assert.equal(await page.getByRole('combobox',{name:'Plaque shape'}).inputValue(),'heritage');assert.equal(await page.getByRole('button',{name:'AMS multicolour',exact:true}).getAttribute('aria-pressed'),'true');
 await page.setViewportSize({width:390,height:844});await page.getByRole('region',{name:'Customise asset'}).scrollIntoViewIfNeeded();
 assert(await page.locator('.assets-page').evaluate(e=>e.scrollWidth<=e.clientWidth));await page.screenshot({path:'data/assets-review/plaque-ams-mobile.png'});
 assert.deepEqual(errors,[]);console.log('PASS: six sized blank/base kits, separate bases, all five plaque shapes in three modes, colour selection, material STL downloads, empty-text validation, persistence and mobile layout.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
