const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const url = process.env.APP_URL || 'http://127.0.0.1:18873';
(async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  try {
    const page = await browser.newPage();
    const settings = JSON.parse(fs.readFileSync('data/rc8-browser-check/seed.json','utf8'));
    await page.addInitScript(settings => {
      if (!localStorage.getItem('deletion-test-seeded')) {
        localStorage.setItem('contour-studio.designs.v1', JSON.stringify([{id:'fixture',updated:new Date().toISOString(),settings,jobId:'deletion-test',step:2,view:'3d',mapRatioLocked:true}]));
        localStorage.setItem('deletion-test-seeded','yes');
      }
    },settings);
    await page.goto(url);
    await page.getByRole('button',{name:'Print files for Deletion regression',exact:true}).click();
    await page.getByRole('heading',{name:'Prepare every piece.',exact:true}).waitFor();
    await page.getByRole('button',{name:'Projects home',exact:true}).click();
    await page.getByRole('button',{name:'Delete Deletion regression',exact:true}).click();
    await page.getByRole('button',{name:'Delete print files only',exact:true}).click();
    await page.getByText('Design saved',{exact:false}).waitFor();
    assert.equal((await page.request.get(url+'/api/jobs/deletion-test')).status(),404);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('contour-studio.designs.v1')));
    assert.equal(saved.length,1); assert(!saved[0].jobId); assert.equal(saved[0].settings.name,settings.name);
    await page.reload();
    await page.locator('.library-trash summary').click();
    await page.getByRole('button',{name:'Restore',exact:true}).click();
    await page.getByRole('button',{name:'Print files for Deletion regression',exact:true}).waitFor();
    assert.equal((await page.request.get(url+'/api/jobs/deletion-test')).status(),200);
    await page.getByRole('button',{name:'Delete Deletion regression',exact:true}).click();
    await page.getByRole('button',{name:'Delete project',exact:true}).click();
    await page.getByText('Your first project starts with a place that means something to you.').waitFor();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('contour-studio.designs.v1'))),[]);
    await page.reload();
    await page.locator('.library-trash summary').click();
    await page.getByRole('button',{name:'Restore',exact:true}).click();
    await page.getByRole('button',{name:'Print files for Deletion regression',exact:true}).waitFor();
    assert.equal((await page.request.get(url+'/api/files/deletion-test/project.zip')).status(),200);
    console.log('PASS: delete print files keeps editable design; delete project removes library entry; both survive reload and restore the complete print package.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
