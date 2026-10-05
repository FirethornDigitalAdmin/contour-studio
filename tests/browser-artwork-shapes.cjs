const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const button=name=>page.getByRole('button',{name,exact:true});
  const size=()=>page.getByLabel('Width · mm',{exact:true}).inputValue().then(async w=>[Number(w),Number(await page.getByLabel('Height · mm',{exact:true}).inputValue())]);
  const path=()=>page.locator('.selection-shape > path').first().getAttribute('d');
  try {
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173');
    await button('New project').click(); await button('Single map').click(); await button('Create project').click();
    await page.locator('.selection-box:not([hidden])').waitFor();
    assert(await page.getByRole('heading',{name:'Shape',exact:true}).evaluate(el=>!!(el.compareDocumentPosition(document.querySelector('.size-presets'))&Node.DOCUMENT_POSITION_FOLLOWING)));
    await button('Square').click(); const square=await path();
    await page.getByRole('group',{name:'Rotate shape',exact:true}).getByRole('button',{name:'45°',exact:true}).click();
    const rotated=await path(); assert.notEqual(square,rotated);
    assert.equal(await page.getByLabel('Shape rotation · degrees').inputValue(),'45');
    await button('Undo design change').click(); assert.equal(await page.getByLabel('Shape rotation · degrees').inputValue(),'0');
    await button('Redo design change').click(); assert.equal(await path(),rotated);
    for(const shape of ['Rectangle','Triangle','Oval','Heart','Letter']) {
      await button(shape).click();
      if(shape==='Letter') await page.getByLabel('Artwork letter').selectOption('I');
      let ratio;
      for(let i=0;i<3;i++) {
        await page.getByRole('group',{name:'Artwork sizes',exact:true}).getByRole('button').nth(i).click();
        const [w,h]=await size(); assert.equal(Math.max(w,h),[200,400,600][i]);
        if(ratio===undefined)ratio=w/h; else assert(Math.abs(w/h-ratio)<.002,`${shape} retains its proportions`);
      }
    }
    await page.getByLabel('Artwork letter').selectOption('O');
    await page.getByRole('group',{name:'Rotate shape',exact:true}).getByRole('button',{name:'45°',exact:true}).click();
    await page.getByRole('group',{name:'Artwork sizes',exact:true}).getByRole('button').nth(0).click();
    const letter=await path(); assert.equal((letter.match(/M/g)||[]).length,2,'O has an opening');
    assert.equal(await page.getByLabel('Width · mm',{exact:true}).isVisible(),false,'custom dimensions start collapsed');
    await page.locator('summary').filter({hasText:'Custom size'}).click();
    await page.getByLabel('Width · mm',{exact:true}).fill('300'); await page.getByLabel('Width · mm',{exact:true}).blur();
    await page.getByLabel('Height · mm',{exact:true}).fill('200'); await page.getByLabel('Height · mm',{exact:true}).blur();
    assert.deepEqual(await size(),[300,200],'custom dimensions can stretch the shape');
    await button('Frame').click(); await page.getByLabel('Border',{exact:true}).selectOption('separate');
    await page.getByLabel('Border width · mm',{exact:true}).fill('5'); await page.getByLabel('Border width · mm',{exact:true}).blur();
    assert(await page.locator('.selection-shape .shape-border-preview').isVisible());
    const savedPath=await path();
    await page.waitForTimeout(800); await page.reload(); await button('Current project').click();
    await button('Size & layout').click(); await page.getByLabel('Artwork letter').waitFor();
    assert.equal(await page.getByLabel('Artwork letter').inputValue(),'O'); assert.equal(await page.getByLabel('Shape rotation · degrees').inputValue(),'45'); assert.equal(await path(),savedPath); assert.deepEqual(await size(),[300,200]);
    await page.locator('.selection-box:not([hidden])').waitFor(); await page.waitForTimeout(1000);
    await page.screenshot({path:'data/artwork-shapes-letter.png'});
    await page.setViewportSize({width:390,height:844}); await button('Size & layout').click(); await page.getByLabel('Artwork letter').scrollIntoViewIfNeeded();
    assert(await page.getByLabel('Artwork letter').isVisible());
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
    await page.screenshot({path:'data/artwork-shapes-mobile.png'});
    assert.deepEqual(errors,[]);
    console.log('PASS: rotation/undo, proportional size presets, custom dimensions, matching borders, letter openings, draft reload and mobile.');
  } catch(error) { await page.screenshot({path:'data/artwork-shapes-failure.png'}); throw error; }
  finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
