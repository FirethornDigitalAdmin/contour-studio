// Make lightweight card images from actual print-export GLBs, without redrawing geometry.
// PLAYWRIGHT_MODULE=/path/to/playwright node scripts/render-project-examples.mjs
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(process.env.PLAYWRIGHT_MODULE+'/package.json');
const {chromium}=require('playwright'),sharp=require('sharp');
const existing=JSON.parse(await readFile('public/project-examples/manifest.json','utf8'));
const examples=existing.map((example,index)=>({kind:example.kind,place:example.place,source:process.argv[index+2]||example.source.replace(/^\//,'')}));
const root=resolve('.'),types={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{
 const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(5189,'127.0.0.1',done));
await mkdir('public/project-examples',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const manifest=[];
 for(const example of examples){
  const page=await browser.newPage({viewport:{width:960,height:700},deviceScaleFactor:2});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:5189/scripts/render-project-examples.html?${new URLSearchParams({kind:example.kind,source:'/'+example.source})}`);
  await page.waitForFunction(()=>window.modelRender?.ready,{timeout:60000});
  if(errors.length)throw new Error(errors.join('\n'));
  const png=await page.screenshot();
  await sharp(png).resize(960,700).webp({quality:90}).toFile(`public/project-examples/${example.kind}.webp`);
  const geometry=await readFile(example.source);
  manifest.push({...example,...await page.evaluate(()=>window.modelRender),sha256:createHash('sha256').update(geometry).digest('hex'),image:`${example.kind}.webp`,attribution:'Map features © OpenStreetMap contributors (ODbL); elevation Mapzen / AWS Terrain Tiles.'});
  console.log(`${example.kind}: ${manifest.at(-1).meshes} exported meshes, ${manifest.at(-1).triangles} triangles`);
  await page.close();
 }
 await writeFile('public/project-examples/manifest.json',JSON.stringify(manifest,null,2)+'\n');
}finally{await browser.close();server.close();}
