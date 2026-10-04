const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  for(const journey of ['Continuous tiled map','Collection of places'])for(const shape of ['Square','Hexagonal']) {
   const page=await browser.newPage({viewport:{width:1440,height:650}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(process.env.APP_URL||'http://127.0.0.1:18873');
   await page.getByRole('button',{name:'New project',exact:true}).click();
   await page.getByRole('button',{name:journey,exact:true}).click();
   await page.getByRole('group',{name:'Tile shape',exact:true}).getByRole('button',{name:shape,exact:true}).click();
   const action=page.getByRole('button',{name:'Create project',exact:true});
   const bounds=await action.boundingBox();assert(bounds&&bounds.y>=0&&bounds.y+bounds.height<=650,'Create project must remain visible on short native windows');
   await action.click();
   await page.getByRole('button',{name:'Edinburgh',exact:true}).click();
   await page.getByRole('button',{name:'Artwork layout',exact:true}).click();
   await page.getByRole('button',{name:'Add tile at row 1, column 2',exact:true}).click();
   await page.waitForFunction(()=>JSON.parse(localStorage.getItem('contour-studio.draft.v1')||'{}').settings?.map_tiles.length===2);
   let s=await page.evaluate(()=>JSON.parse(localStorage.getItem('contour-studio.draft.v1')).settings);
   assert.equal(s.wall_mode,journey==='Continuous tiled map'?'continuous':'places');
   assert.equal(s.map_format,shape==='Square'?'mini_tiles':'hexagons');
   if(journey==='Collection of places') {
    assert.equal(s.map_tiles[0].name,'Edinburgh');
    await page.getByRole('button',{name:'Chamonix',exact:true}).click();
    await page.getByRole('button',{name:'Artwork layout',exact:true}).click();
    await page.getByRole('button',{name:'Edit tile 1: Edinburgh',exact:true}).click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('contour-studio.draft.v1')).settings.name==='Edinburgh');
    s=await page.evaluate(()=>JSON.parse(localStorage.getItem('contour-studio.draft.v1')).settings);
    assert.equal(s.map_tiles[1].name,'Chamonix');
   }
   const validated=await page.request.post((process.env.APP_URL||'http://127.0.0.1:18873')+'/api/validate',{data:s});assert(validated.ok(),await validated.text());
   await page.reload();
   await page.getByRole('button',{name:'Continue last project',exact:true}).click();
   const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('contour-studio.draft.v1')).settings);
   assert.deepEqual(restored.map_tiles,s.map_tiles);assert.deepEqual(restored.wall_positions,[[0,0],[0,1]]);
   await page.getByRole('button',{name:'Artwork layout',exact:true}).click();
   await page.screenshot({path:`data/rc9-wall-${s.wall_mode}-${s.map_format}.png`});
   await page.setViewportSize({width:390,height:844});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS: both journeys and shapes start with one tile, add adjacent tiles, preserve distinct places, validate through API, reopen after reload and fit mobile.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
