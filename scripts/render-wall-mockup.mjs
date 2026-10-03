import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(process.env.PLAYWRIGHT_MODULE + '/package.json');
const { chromium } = require('playwright');
const root = resolve('.');
const types = { '.html':'text/html', '.js':'text/javascript', '.png':'image/png', '.glb':'model/gltf-binary' };
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = resolve(root, '.' + pathname);
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(5188, '127.0.0.1', done));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport:{width:1536,height:1024}, deviceScaleFactor:2 });
  page.on('pageerror', error => console.error(error.message));
  await page.goto('http://127.0.0.1:5188/scripts/render-wall-mockup.html');
  await page.waitForFunction(() => window.wallRender?.ready, {timeout:60000});
  await page.screenshot({ path: 'data/wall-mockup/bolton-on-wall-full.png' });
  const sharp = require('sharp');
  const source = 'data/wall-mockup/bolton-on-wall-full.png';
  await sharp(source).resize(1920,1280).webp({quality:88}).toFile('public/bolton-on-wall-1920.webp');
  await sharp(source).resize(960,640).webp({quality:88}).toFile('public/bolton-on-wall-960.webp');
  await sharp(source).resize(1920,1280).jpeg({quality:90,mozjpeg:true}).toFile('public/bolton-on-wall-1920.jpg');
  // A tighter portrait crop keeps the real product readable on phone screens.
  await sharp(source).extract({left:806,top:0,width:1638,height:2048}).resize(960,1200).webp({quality:88}).toFile('public/bolton-on-wall-mobile.webp');
  console.log(JSON.stringify(await page.evaluate(() => window.wallRender)));
} finally { await browser.close(); server.close(); }
