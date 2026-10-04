const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const fs=require('node:fs');const assert=require('node:assert/strict');
const url=process.env.APP_URL||'http://127.0.0.1:5178';
(async()=>{const b=await chromium.launch({headless:true,channel:'chrome'});try{
for(const format of ['mini_tiles','hexagons','jigsaw']){
const p=await b.newPage({baseURL:url,viewport:{width:1440,height:1000}});p.setDefaultTimeout(15000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
const settings=JSON.parse(fs.readFileSync(`data/formats-review/${format}/settings.json`));
const response=await p.request.post('/api/generate',{data:settings});assert(response.ok(),await response.text());const {id}=await response.json();
let job;for(let i=0;i<90;i++){job=await(await p.request.get(`/api/jobs/${id}`)).json();if(['complete','failed'].includes(job.status))break;await new Promise(r=>setTimeout(r,1000));}
assert.equal(job.status,'complete',job.message);assert.equal(job.result.settings.map_format,format);
await p.addInitScript(({settings,id})=>localStorage.setItem('contour-studio.draft.v1',JSON.stringify({version:1,workflowVersion:2,settings,jobId:id,step:4,view:'3d'})),{settings,id});
await p.goto(url);await p.locator('.preview canvas').waitFor();await p.locator('.preview-message').waitFor({state:'hidden',timeout:30000});await p.getByRole('link',{name:'Download print pack',exact:true}).waitFor();
assert.equal(await p.locator('.stale-note').count(),0);const zip=await p.request.get(`/api/files/${id}/project.zip`);assert(zip.ok());assert((await zip.body()).length>10000);
await p.getByLabel('Inspect a piece',{exact:true}).selectOption(job.result.parts.find(x=>x.kind==='terrain').id);
await p.screenshot({path:`data/formats-review/${format}/browser-preview.png`});assert.deepEqual(errors,[]);console.log(`PASS ${format}: real map generation, ${job.result.parts.length} valid pieces, 3D inspection and ZIP download. Job ${id}`);await p.close();
}
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
