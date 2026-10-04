const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const fs = require('node:fs');

(async () => {
  const origin = process.env.APP_URL || 'http://127.0.0.1:4193';
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 1000 } });
    const crawler = await noJs.newPage();
    const response = await crawler.goto(origin);
    assert.equal(response.status(), 200);
    assert.equal(await crawler.locator('h1').count(), 1);
    assert.match(await crawler.locator('h1').innerText(), /A little piece/);
    assert.equal(await crawler.getByRole('link', { name: 'Download for Mac', exact: true }).count(), 1);
    assert.equal(await crawler.getByRole('link', { name: 'Download for Windows', exact: true }).count(), 1);
    assert.equal(await crawler.locator('html').getAttribute('lang'), 'en-GB');
    assert.equal(await crawler.locator('link[rel=canonical]').getAttribute('href'), 'https://contour-studio.app/');
    assert.match(await crawler.locator('meta[name=robots]').getAttribute('content'), /max-image-preview:large/);
    assert.equal(await crawler.locator('.download-site').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(252, 251, 247)', 'prerendered homepage loads its own styles without JavaScript');
    const schema = JSON.parse(await crawler.locator('script[type="application/ld+json"]').textContent());
    assert(schema['@graph'].some(node => node['@type'] === 'WebSite' && node.name === 'Contour Studio'));
    assert(schema['@graph'].some(node => node['@type'] === 'SoftwareApplication' && node.offers.price === '0'));
    assert.equal(await crawler.locator('meta[property="og:image"]').getAttribute('content'), 'https://contour-studio.app/og.png');
    assert.equal(await crawler.locator('meta[name="twitter:card"]').getAttribute('content'), 'summary_large_image');
    const card = await crawler.request.get(`${origin}/og.png`);
    assert.equal(card.status(), 200);
    assert.match(card.headers()['content-type'], /^image\/png/);
    const cardMeta = await sharp(await card.body()).metadata();
    assert.equal(cardMeta.width, 1200); assert.equal(cardMeta.height, 630);
    const manifestResponse = await crawler.request.get(`${origin}/site.webmanifest`);
    const manifest = await manifestResponse.json();
    assert.equal(manifest.name, 'Contour Studio');
    for (const icon of manifest.icons) {
      const response = await crawler.request.get(new URL(icon.src, origin).href);
      assert.equal(response.status(), 200);
      const metadata = await sharp(await response.body()).metadata();
      assert.equal(`${metadata.width}x${metadata.height}`, icon.sizes);
    }
    for (const icon of ['favicon.svg', 'favicon.ico', 'favicon-32.png', 'favicon-48.png', 'apple-touch-icon.png']) {
      assert.equal((await crawler.request.get(`${origin}/${icon}`)).status(), 200, icon);
    }
    assert.match(await (await crawler.request.get(`${origin}/robots.txt`)).text(), /Sitemap: https:\/\/contour-studio.app\/sitemap.xml/);
    assert.match(await (await crawler.request.get(`${origin}/sitemap.xml`)).text(), /<loc>https:\/\/contour-studio.app\/<\/loc>/);
    fs.mkdirSync('data/site-seo', { recursive: true });
    await crawler.screenshot({ path: 'data/site-seo/home-no-javascript.png', fullPage: true });
    await noJs.close();

    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /hydration|Minified React error/i.test(message.text())) errors.push(message.text()); });
    await page.goto(origin);
    await page.getByRole('button', { name: 'Explode model', exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('.hero-model-explode')?.disabled, { timeout: 60000 });
    await page.getByRole('button', { name: 'Explode model', exact: true }).click();
    await page.getByRole('button', { name: 'Bring together', exact: true }).waitFor();
    for (const [width, height] of [[1440, 1000], [768, 1000], [390, 844]]) {
      await page.setViewportSize({ width, height });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px homepage fits`);
      await page.screenshot({ path: `data/site-seo/home-${width}.png`, fullPage: true });
    }
    await page.getByRole('link', { name: 'Open the free web designer', exact: true }).click();
    await page.getByRole('button', { name: 'Choose location', exact: true }).waitFor();
    assert.equal(await page.title(), 'Map Art Designer | Contour Studio');
    await page.goto(`${origin}/#workspace`);
    await page.getByRole('button', { name: 'Choose location', exact: true }).waitFor();
    await page.goto(origin);
    await page.locator('.download-site').waitFor();
    assert.equal(await page.title(), 'Contour Studio | Free 3D-Printable Map Art');
    assert.deepEqual(errors, [], 'hydration and route transitions are free of runtime errors');
    console.log('PASS: styled homepage without JavaScript, canonical and structured data, share image, icon assets, manifest, robots/sitemap, responsive layout, hydrated 3D controls and direct/linked workspace routes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
