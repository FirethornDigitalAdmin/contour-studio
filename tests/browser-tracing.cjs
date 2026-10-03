const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {reveal}=require('./ui-helpers.cjs');
(async()=>{
for(const [name,engine] of [['chrome',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name==='chrome'?{channel:'chrome'}:{})});
 try{
 const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true,hasTouch:true});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Use a deterministic footprint fixture; schema/generation tests cover source projection separately.
 await page.route('**/api/footprints',r=>r.fulfill({json:{type:'FeatureCollection',attribution:'Test source outlines',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[[[100,100],[180,100],[180,180],[100,180],[100,100]]]},properties:{}}]}}));
 await page.goto(process.env.APP_URL||'http://127.0.0.1:5181');
 await page.getByRole('button',{name:'Add missing details',exact:true}).click();
 const canvas=page.getByRole('application',{name:'Building tracing canvas'});await canvas.waitFor();
 const coord=async(x,y)=>{const r=await canvas.boundingBox();return [r.x+r.width*x,r.y+r.height*y];};
 const tap=async(x,y)=>page.mouse.click(...await coord(x,y));
 const drag=async(a,b)=>{await page.mouse.move(...await coord(...a));await page.mouse.down();await page.mouse.move(...await coord(...b),{steps:8});await page.mouse.up();};
 const polygons=page.locator('.trace-building');
 await drag([.35,.4],[.46,.53]);await page.waitForFunction(()=>document.querySelectorAll('.trace-building').length===1);
 await page.getByLabel('Added building name').fill('My missing house');
 await page.getByLabel('Added building height').fill('18');
 assert.equal(await page.getByLabel('Added building height').inputValue(),'18');
 await page.getByRole('button',{name:'Undo tracing change'}).click();assert.equal(await page.getByLabel('Added building height').inputValue(),'8');
 await page.getByRole('button',{name:'Redo tracing change'}).click();assert.equal(await page.getByLabel('Added building height').inputValue(),'18');
 const before=await polygons.first().getAttribute('points');
 const handle=page.locator('.trace-handle').first();const hb=await handle.boundingBox();await page.mouse.move(hb.x+hb.width/2,hb.y+hb.height/2);await page.mouse.down();await page.mouse.move(hb.x+hb.width/2-15,hb.y+hb.height/2-10,{steps:8});await page.mouse.up();
 assert.notEqual(await polygons.first().getAttribute('points'),before,'corner can be edited');
 await page.getByRole('button',{name:'Rotate building clockwise',exact:true}).click();
 const afterRotate=await polygons.first().getAttribute('points');assert.notEqual(afterRotate,before);
 await page.getByRole('button',{name:'Duplicate',exact:true}).click();assert.equal(await polygons.count(),2);
 await page.getByRole('button',{name:'Delete',exact:true}).click();assert.equal(await polygons.count(),1);
 await page.getByRole('button',{name:'Outline',exact:true}).click();for(const p of [[.55,.3],[.65,.3],[.65,.42],[.61,.42],[.61,.38],[.55,.38]])await tap(...p);
 await page.getByRole('button',{name:'Done',exact:true}).click();assert.equal(await polygons.count(),2);
 await page.getByRole('button',{name:'Outline',exact:true}).click();for(const p of [[.2,.65],[.3,.75],[.2,.75],[.3,.65]])await tap(...p);await page.getByRole('button',{name:'Done',exact:true}).click();assert.equal(await polygons.count(),2,'self crossing outline rejected');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByLabel('Upload reference image').setInputFiles(path.join(__dirname,'fixtures/tracing-reference.png'));
 await page.getByRole('button',{name:'Match two landmarks',exact:true}).waitFor();assert.equal(await page.locator('.trace-surface image').count(),1);
 await page.getByRole('button',{name:'Match two landmarks',exact:true}).click();for(const p of [[.25,.3],[.3,.35],[.65,.6],[.7,.65]])await tap(...p);
 await page.getByRole('button',{name:'Move image',exact:true}).waitFor();
 assert.equal(await page.locator('.trace-surface image').count(),1);
 const transformed=await page.locator('.trace-surface image').getAttribute('transform');assert(!transformed.includes('translate(500 '),'two-landmark alignment changes image position');
 const compare=page.getByRole('button',{name:'Hold to compare map'});const cb=await compare.boundingBox();await page.mouse.move(cb.x+10,cb.y+10);await page.mouse.down();assert.equal(await page.locator('.trace-surface image').count(),0);await page.mouse.up();assert.equal(await page.locator('.trace-surface image').count(),1);
 await page.getByRole('button',{name:'Pan',exact:true}).click();const oldView=await canvas.getAttribute('viewBox');await drag([.4,.45],[.45,.5]);assert.notEqual(await canvas.getAttribute('viewBox'),oldView);
 await page.getByRole('button',{name:'Fit tracing area'}).click();
 await page.waitForTimeout(450);const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('contour-studio.draft.v1')).settings);
 assert.equal(stored.custom_buildings.length,2);assert(stored.reference_image.data.startsWith('data:image/jpeg;base64,'));
 const validation=await page.request.post(new URL('/api/validate',page.url()).href,{data:stored});assert(validation.ok(),await validation.text());
 const save=page.locator('.sidebar').getByRole('button',{name:'Save settings',exact:true,includeHidden:true});await reveal(page,save);
 const [download]=await Promise.all([page.waitForEvent('download'),save.click()]);const savedPath=path.join(__dirname,'../data/tracing-portable-settings.json');await download.saveAs(savedPath);
 const saved=JSON.parse(fs.readFileSync(savedPath,'utf8'));assert.equal(saved.custom_buildings.length,2);assert(saved.reference_image.data);
 await page.getByRole('button',{name:'Import',exact:true}).click();
 await page.locator('.settings-files input[type=file]').setInputFiles(savedPath);
 await page.getByRole('button',{name:'Add missing details',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.trace-building').length===2);
 await page.reload();await page.getByRole('button',{name:'Add missing details',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.trace-building').length===2);assert.equal(await page.locator('.trace-surface image').count(),1,'image and outlines restored');
 await page.screenshot({path:path.join(__dirname,`../data/tracing-${name}-verified.png`),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Add missing details',exact:true}).scrollIntoViewIfNeeded();await canvas.scrollIntoViewIfNeeded();
 await page.getByRole('button',{name:'Outline',exact:true}).click();await canvas.scrollIntoViewIfNeeded();
 for(const p of [[.7,.7],[.85,.7],[.85,.85],[.7,.85]])await page.touchscreen.tap(...await coord(...p));
 await page.getByRole('button',{name:'Done',exact:true}).click();assert.equal(await polygons.count(),3,'touch outline drawing works');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no horizontal overflow on mobile');
 await page.screenshot({path:path.join(__dirname,`../data/tracing-${name}-mobile.png`),fullPage:true});
 assert.deepEqual(errors,[]);console.log(`PASS ${name}: draw, edit corners, rotate, duplicate/delete, outline validation, undo/redo, upload/alignment/compare, pan, schema validation, recovery, mobile.`);
 }finally{await browser.close();}
}
})().catch(e=>{console.error(e);process.exit(1)});
