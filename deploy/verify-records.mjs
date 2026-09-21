import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const c=JSON.parse(await readFile(new URL('./.secrets/viewer.json',import.meta.url)));
const headers={Authorization:'Basic '+Buffer.from(c.username+':'+c.password).toString('base64')};
async function get(path){const r=await fetch(c.url+'/api/reference/records/'+path,{headers});assert.equal(r.status,200,path);return r.json();}
assert.equal((await fetch(c.url+'/api/reference/records/catalog')).status,401);
const catalog=await get('catalog');assert.equal(catalog.datasets.length,12);
const counts={};
for(const d of catalog.datasets){
 counts[d.id]={features:Number(d.feature_count),located:Number(d.located_count),records:Number(d.observation_count)};
 if(!Number(d.feature_count))continue;
 const v=await get('viewport?'+new URLSearchParams({dataset:d.id,bbox:'-180,-85,180,85'}));
 assert.equal(v.count,Number(d.located_count),d.id);assert.ok(v.features.length<=1000);
 if(v.mode==='clusters')assert.equal(v.features.reduce((n,f)=>n+f.count,0),v.count);
}
const et=await get('viewport?dataset=openet&bbox=-102,33,-101,34&period=2018-07&kind=ET');
const eto=await get('viewport?dataset=openet&bbox=-102,33,-101,34&period=2018-07&kind=ETo');assert.equal(et.count,42);assert.ok(et.features.every(f=>f.value>0));assert.notEqual(et.features[0].value,eto.features[0].value);
const details=await get('detail?'+new URLSearchParams({dataset:'openet',key:et.features[0].key}));assert.equal(details.total,24);assert.ok(details.observations.some(r=>r.kind==='ET'));assert.ok(details.observations.some(r=>r.kind==='ETo'));
const archive=await get('rrc?kind=iwar_well');assert.equal(archive.total,117169);assert.equal(archive.rows.length,50);
const api=archive.rows[0].api8;const byApi=await get('rrc?api='+api);assert.ok(byApi.rows.every(r=>r.api8===api));
const w10=await get('rrc?kind=w10_test');assert.equal(w10.total,312331);
assert.equal((await fetch(c.url+'/api/reference/records/rrc?kind=secrets',{headers})).status,400);
const browser=await puppeteer.launch({headless:true});
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});await page.authenticate({username:c.username,password:c.password});const errors=[];page.on('pageerror',e=>errors.push(e.message.replace(/AIza[\w-]+/g,'[REDACTED]')));
 await page.goto(c.url,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForSelector('[data-first-run-choice="explore"]',{visible:true});await page.click('[data-first-run-choice="explore"]');await page.waitForFunction(()=>window.__godsEyeView?.dataManager);
 await page.click('#open-reference-library');await page.type('#reference-library input[type=search]','Evapotranspiration');await page.click('#reference-library nav button');await page.waitForFunction(()=>document.querySelector('#reference-library .ref-primary')?.textContent==='Open collection');await page.click('#reference-library .ref-primary');
 await page.waitForFunction(()=>document.querySelector('#records-panel [data-view]')?.textContent.includes('42 in view'),{timeout:60000});
 assert.match(await page.$eval('#records-panel [data-note]',e=>e.textContent),/2018/);
 await new Promise(r=>setTimeout(r,2000));await mkdir(new URL('../screenshots/',import.meta.url),{recursive:true});await page.screenshot({path:new URL('../screenshots/openet-fields.png',import.meta.url).pathname});
 const point=await page.evaluate(()=>{const v=window.__godsEyeView.viewer,s=v.dataSources.getByName('Reference · openet')[0];for(const e of s.entities.values){if(!e.point)continue;const p=v.scene.cartesianToCanvasCoordinates(e.position.getValue(v.clock.currentTime));if(p&&p.x>280&&p.x<1050&&p.y>180&&p.y<820&&v.scene.pick(p)?.id)return{x:p.x,y:p.y};}});assert.ok(point,'OpenET field is visible and pickable');await page.mouse.click(point.x,point.y);
 await page.waitForFunction(()=>document.querySelector('#records-panel [data-detail]').textContent.includes('24 linked records'));
 await page.select('#records-panel [data-measurement]','ETo');await page.waitForFunction(()=>!document.querySelector('#records-panel [data-view]').textContent.includes('Loading'));
 await page.select('#records-panel [data-dataset]','ponds');await page.waitForFunction(()=>document.querySelector('#records-panel [data-view]').textContent.includes('52 in view'),{timeout:30000});
 await page.select('#records-panel [data-dataset]','flares');await page.waitForFunction(()=>document.querySelector('#records-panel [data-view]').textContent.includes('1,850 in view'),{timeout:30000});
 await new Promise(r=>setTimeout(r,1500));await page.screenshot({path:new URL('../screenshots/flares-and-water.png',import.meta.url).pathname});
 await page.select('#records-panel [data-dataset]','rrc-records');await page.waitForFunction(()=>document.querySelector('#records-panel [data-detail]').textContent.includes('matching records'));
 await page.type('#records-panel [data-api]',api);await page.click('#records-panel [data-search] button');await page.waitForFunction(a=>document.querySelector('#records-panel [data-detail]').textContent.includes(a),{},api);
 await page.screenshot({path:new URL('../screenshots/rrc-record-explorer.png',import.meta.url).pathname});
 await page.click('#records-panel [data-hide]');await page.waitForSelector('#records-panel',{hidden:true});assert.equal(await page.evaluate(()=>{const v=window.__godsEyeView.viewer;for(let i=0;i<v.dataSources.length;i++)if(v.dataSources.get(i).name.startsWith('Reference · '))return true;return false;}),false);
 assert.deepEqual(errors,[]);const result={counts,etSample:et.features[0].value,etoSample:eto.features[0].value,rrcApi:api,errors};await writeFile(new URL('./last-records-verification.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
