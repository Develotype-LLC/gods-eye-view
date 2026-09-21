import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const c=JSON.parse(await readFile(new URL('./.secrets/viewer.json',import.meta.url)));
const auth='Basic '+Buffer.from(c.username+':'+c.password).toString('base64');
async function get(path){const r=await fetch(c.url+'/api/reference/texas'+path,{headers:{Authorization:auth}});assert.equal(r.status,200,path);return r.json();}
assert.equal((await fetch(c.url+'/api/reference/texas/status')).status,401);
const status=await get('/status');assert.equal(Number(status.datasets.find(d=>d.name==='gis').row_count),1396962);assert.equal(Number(status.datasets.find(d=>d.name==='uic').row_count),126745);
const statewide=await get('/viewport?bbox=-107,25,-93,37');assert.equal(statewide.mode,'clusters');assert.ok(statewide.features.length<1000);assert.equal(statewide.features.reduce((n,f)=>n+f.count,0),statewide.count);
const east=await get('/viewport?bbox=-95.1,31.2,-94.9,31.4');assert.ok(east.count>0,'East Texas is present outside the old pilot');
const well=await get('/well?api=10300256');assert.equal(well.matches[0].api8,'10300256');assert.ok(well.permits.some(p=>p.uic==='000042723'));
const history=await get('/history?api=10300256');assert.ok(history.rows.some(r=>r.formatted_date.startsWith('2016-01')&&Number(r.vol_liq)===7104));
const cached=await get('/history?api=10300256');assert.equal(cached.cache,'cached');assert.equal(cached.fetchedAt,history.fetchedAt);
const browser=await puppeteer.launch({headless:true});
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});await page.authenticate({username:c.username,password:c.password});
 const errors=[];page.on('pageerror',e=>errors.push(e.message.replace(/AIza[\w-]+/g,'[REDACTED]')));
 await page.goto(c.url,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForSelector('[data-first-run-choice="explore"]',{visible:true});await page.click('[data-first-run-choice="explore"]');
 await page.waitForFunction(()=>window.__godsEyeView?.dataManager);await page.click('#open-reference-library');await page.waitForSelector('#reference-library .ref-primary');
 assert.match(await page.$eval('#reference-library h3',e=>e.textContent),/Texas wells/);await page.click('#reference-library .ref-primary');
 await page.waitForSelector('#texas-panel',{visible:true});await page.waitForFunction(()=>document.querySelector('#texas-panel [data-view]').textContent.includes('locations in view'),{timeout:60000});
 await page.waitForFunction(()=>window.__godsEyeView.viewer.camera.positionCartographic.height>1000000 && document.querySelector('#texas-panel [data-view]').textContent.includes('click a cluster to zoom'),{timeout:60000});
 await new Promise(r=>setTimeout(r,800));
 await mkdir(new URL('../screenshots/',import.meta.url),{recursive:true});await page.screenshot({path:new URL('../screenshots/texas-statewide.png',import.meta.url).pathname});
 const cluster=await page.evaluate(()=>{const v=window.__godsEyeView.viewer;const source=v.dataSources.getByName('Texas RRC statewide wells')[0];for(const e of source.entities.values){if(!e.label)continue;const p=v.scene.cartesianToCanvasCoordinates(e.position.getValue(v.clock.currentTime));if(p&&p.x>450&&p.x<1050&&p.y>280&&p.y<750&&v.scene.pick(p)?.id===e)return{x:p.x,y:p.y,height:v.camera.positionCartographic.height};}});
 assert.ok(cluster,'cluster marker is rendered and pickable at statewide zoom');await page.mouse.click(cluster.x,cluster.y);await page.waitForFunction(h=>window.__godsEyeView.viewer.camera.positionCartographic.height<h*.8,{},cluster.height);
 await page.type('#texas-panel [data-api]','10300256');await page.click('#texas-panel form button');
 await page.waitForFunction(()=>document.querySelector('#texas-panel [data-detail]').textContent.includes('000042723'));
 await page.click('#texas-panel [data-detail] button');await page.waitForFunction(()=>document.querySelector('#texas-panel [data-detail]').textContent.includes('permit-month records'));
 await new Promise(r=>setTimeout(r,2500));await page.screenshot({path:new URL('../screenshots/texas-well-history.png',import.meta.url).pathname});
 await page.select('#texas-panel [data-category]','Oil');await page.waitForFunction(()=>!document.querySelector('#texas-panel [data-view]').textContent.includes('Loading'));
 await page.click('#texas-panel [data-hide]');await page.waitForSelector('#texas-panel',{hidden:true});assert.equal(await page.evaluate(()=>window.__godsEyeView.dataManager.isEnabled('texas-wells')),false);
 console.log(JSON.stringify({gisRecords:1396962,uicRecords:126745,statewideLocated:statewide.count,clusterCount:statewide.features.length,eastTexasCount:east.count,historyRows:history.rows.length,persistentHistoryCache:cached.cache,errors}));assert.deepEqual(errors,[]);
}finally{await browser.close();}
