// Exercise real saved separate-frame geometry, print downloads and keyboard inspection.
// Set PREVIEW_JOB_ID to a completed separate-frame project, or use the most recent one.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert=require('node:assert/strict');
const fs=require('node:fs');
const url = process.env.APP_URL || "http://127.0.0.1:8765";
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({baseURL:url,viewport:{width:1440,height:1000},acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {
  let projectId = process.env.PREVIEW_JOB_ID;
  if (!projectId) {
   const projects = await (await page.request.get('/api/projects')).json();
   projectId = projects.find(project => project.frame_mode === 'separate')?.id;
  }
  assert(projectId, 'a completed separate-frame project is needed for real geometry checks');
  const job = await (await page.request.get(`/api/jobs/${encodeURIComponent(projectId)}`)).json();
  assert.equal(job.status, 'complete');
  assert.equal(job.result.settings.frame_mode, 'separate');
  const terrainParts = job.result.parts.filter(part => part.kind === 'terrain');
  const terrainId = terrainParts[0].id;
  const frameId = job.result.parts.find(part => part.kind === 'frame').id;
  // Inspect a completed package without taking over another active generation.
  await page.route('**/api/active-job', route => route.fulfill({ json: null }));
  await page.addInitScript(({job})=>localStorage.setItem('contour-studio.draft.v1',JSON.stringify({version:1,settings:job.result.settings,jobId:job.id,step:2,view:'3d'})),{job});
  await page.goto('/');
  await page.locator('.preview canvas').waitFor();
  await page.locator('.preview-message').waitFor({state:'hidden',timeout:60000});
  const button=name=>page.getByRole('button',{name,exact:true});
  await page.getByLabel('Inspect a piece',{exact:true}).selectOption(terrainParts[1]?.id || terrainId);
  await button('Only this piece').click();
  assert.equal(await button('Show all').getAttribute('aria-pressed'),'true');
  await button('Clear piece selection').click();
  await page.getByLabel('Inspect a piece',{exact:true}).selectOption(terrainId);
  // A new selection after clearing isolation must not silently isolate again.
  assert.equal(await button('Only this piece').getAttribute('aria-pressed'),'false');
  await button('Frame').click();
  if (!await page.locator('.parts-details').evaluate(element => element.open)) await page.locator('.parts-details > summary').click();
  await page.locator('.parts-details').getByRole('button',{name:frameId.replaceAll('_', ' '),exact:true}).click();
  await page.getByRole('button', { name: 'Frame', exact: true, pressed: true }).waitFor();
  assert.equal(await button('Frame').getAttribute('aria-pressed'),'true','package frame selection restores a hidden frame');
  await button('Focus').click();
  await button('Only this piece').click();
  await button('Frame').click();
  assert.equal(await button('Only this piece').getAttribute('aria-pressed'), 'false', 'hiding an isolated frame restores the terrain');
  await button('Frame').click();
  await button('Only this piece').click();
  await button('Fit the whole artwork in view').click();
  assert.equal(await button('Only this piece').getAttribute('aria-pressed'), 'false', 'fit artwork restores the full scene');
  await button('Appearance').click();
  await page.getByLabel('Lighting',{exact:true}).selectOption('relief');
  await page.getByLabel('Lighting',{exact:true}).press('Escape');
  assert.equal(await button('Appearance').getAttribute('aria-expanded'),'false');
  assert.equal(await button('Appearance').evaluate(el=>document.activeElement===el),true,'Escape restores keyboard focus');
  await button('Separate pieces').click();
  await button('Join pieces').click();
  for (const view of ['top','front','side','perspective']) await page.getByLabel('Camera view',{exact:true}).selectOption(view);
  const download=page.waitForEvent('download');await button('Save image').click();
  const image=await download;const bytes=fs.readFileSync(await image.path());assert.deepEqual([...bytes.slice(0,8)],[137,80,78,71,13,10,26,10]);assert(bytes.length>10000);
  await page.locator('.assembly-checklist summary').click();
  assert.equal(await page.locator('.assembly-test-files a').count(), job.result.parts.filter(part => ['coupon','key'].includes(part.kind)).length);
  assert(await page.locator('.assembly-checklist').innerText().then(t=>t.includes(['rebated-insert','chamfered-insert'].includes(job.result.model.frame_fit?.assembly) ? 'supporting lip' : 'Dry-fit the surround')), 'assembly wording matches the actual package version');
  for (const a of await page.locator('.assembly-test-files a').all()) { const href=await a.getAttribute('href'); assert((await page.request.get(href)).ok()); }
  const assembly=page.locator('.download-cards a').last();assert.notEqual(await assembly.getAttribute('download'),null);
  for(const size of [{width:390,height:844},{width:320,height:740},{width:1024,height:576},{width:900,height:650},{width:1440,height:1000}]) {
   await page.setViewportSize(size);
   await page.locator('.preview').scrollIntoViewIfNeeded();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`page fits ${size.width}`);
   await page.locator('.preview').screenshot({path:`data/cleanup-preview-${size.width}.png`});
   assert(await page.locator('.preview-inspection-tools button').evaluateAll(buttons => buttons.every(button => { const rect = button.getBoundingClientRect(); const panel = button.closest('.preview').getBoundingClientRect(); return rect.left >= panel.left && rect.right <= panel.right; })), `inspection controls fit ${size.width}px`);
  }
  // Layout keyboard and clipped rounded-edge rendering.
  await page.locator('.stepper').getByRole('button', { name: /Format/ }).click();
  await page.getByRole('button',{name:'Tile layout',exact:true}).click();
  await page.locator('.layout-diagram').waitFor();
  await page.getByRole('button',{name:'Artwork layout',exact:true}).click();
  assert.equal(await page.locator('.layout-tile').first().locator('xpath=..').getAttribute('clip-path') !== null, true, 'rounded artwork outline clips the tile overlay');
  const tile=page.getByRole('button',{name:'Inspect tile A1',exact:true});await tile.focus();await tile.press('ArrowRight');
  const hasNextTile = terrainParts.length > 1;
  assert.equal(await page.getByLabel('Inspect tile',{exact:true}).inputValue(), hasNextTile ? '1' : '0');
  await page.getByRole('button',{name: hasNextTile ? (job.result.layout.columns > 1 ? 'Inspect tile A2' : 'Inspect tile B1') : 'Inspect tile A1',exact:true}).press('Enter');
  assert.equal(await button('Build plate').getAttribute('aria-pressed'),'true');
  assert(await button('Build plate').evaluate(element => document.activeElement === element), 'tile keyboard inspection retains focus');
  assert.deepEqual(errors,[]);
  console.log('PASS preview controls, selection/isolation, hidden frame restoration, PNG, accessible appearance, versioned assembly instructions, direct fit downloads, responsive widths and keyboard tile inspection.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
