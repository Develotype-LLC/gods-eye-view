import {readFile, mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const c=JSON.parse(await readFile(new URL('./.secrets/viewer.json',import.meta.url)));
const path='/api/reference/rrc/injection';
assert.equal((await fetch(c.url+path)).status,401);
const response=await fetch(c.url+path,{headers:{Authorization:'Basic '+Buffer.from(c.username+':'+c.password).toString('base64')}});
assert.equal(response.status,200);const data=await response.json();assert.equal(data.wellCount,160);assert.equal(data.sourceMode,'rrc-api');assert.ok(data.sourceRetrievedAt);
const browser=await puppeteer.launch({headless:true});
try {
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});await page.authenticate({username:c.username,password:c.password});
 const errors=[];page.on('pageerror',e=>errors.push(e.message.replace(/AIza[\w-]+/g,'[REDACTED]')));
 await page.goto(c.url,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForSelector('[data-first-run-choice="explore"]',{visible:true});await page.click('[data-first-run-choice="explore"]');
 await page.waitForFunction(()=>window.__godsEyeView?.dataManager);await page.click('#open-reference-library');await page.type('#reference-library input[type=search]','Disposal and injection wells');await page.click('#reference-library nav button');await page.waitForSelector('#reference-library .ref-primary');await page.click('#reference-library .ref-primary');
 await page.waitForSelector('#injection-panel',{visible:true});await new Promise(r=>setTimeout(r,3000));
 const well=data.wells.find(w=>w.history.length>20);
 await page.select('#injection-panel [data-well]',well.id);
 await page.$eval('#injection-panel [data-month]',(node,month)=>{node.value=month;node.dispatchEvent(new Event('change'));},well.history[0].month);
 await page.waitForFunction(api=>document.querySelector('#injection-panel [data-details]').textContent.includes(api),{},well.api8);
 const record=well.history[0];const detail=await page.$eval('#injection-panel [data-details]',n=>n.textContent);assert.ok(detail.includes(record.bbl.toLocaleString('en-US',{maximumFractionDigits:1})));
 await page.click('#injection-panel summary');assert.equal(await page.$$eval('#injection-panel table tr',items=>items.length),well.history.length+1);
 const noHistory=data.wells.find(w=>!w.history.length);await page.select('#injection-panel [data-well]',noHistory.id);assert.ok((await page.$eval('#injection-panel [data-details]',n=>n.textContent)).includes('No monthly history'));
 await page.select('#injection-panel [data-well]',well.id);
 // Enable the satellite raster alongside wells through the public lifecycle.
 await page.evaluate(async()=>{await window.__godsEyeView.dataManager.setEnabled('ground-motion',true,{origin:'user'});});
 await page.waitForSelector('#ground-motion-legend',{visible:true});await new Promise(r=>setTimeout(r,3000));
 const count=await page.evaluate(()=>{const v=window.__godsEyeView.viewer;for(let i=0;i<v.dataSources.length;i++){const d=v.dataSources.get(i);if(d.name==='RRC disposal wells')return d.entities.values.length;}return 0;});assert.equal(count,160);
 const picked=await page.evaluate(()=>{const v=window.__godsEyeView.viewer;for(let i=0;i<v.dataSources.length;i++){const d=v.dataSources.get(i);if(d.name!=='RRC disposal wells')continue;for(const e of d.entities.values){const p=v.scene.cartesianToCanvasCoordinates(e.position.getValue(v.clock.currentTime));if(p&&p.x>450&&p.x<1000&&p.y>350&&p.y<780)return {x:p.x,y:p.y,id:e.id.slice(10)};}}});
 assert.ok(picked,'a well marker is visible');await page.mouse.click(picked.x,picked.y);await page.waitForFunction(id=>document.querySelector('#injection-panel [data-well]').value===id,{},picked.id);
 await mkdir(new URL('../screenshots/',import.meta.url),{recursive:true});await page.screenshot({path:new URL('../screenshots/injection-pilot.png',import.meta.url).pathname});
 await page.click('#injection-panel [data-hide]');await page.waitForSelector('#injection-panel',{hidden:true});
 assert.equal(await page.evaluate(()=>window.__godsEyeView.dataManager.isEnabled('ground-motion')),true);
 console.log(JSON.stringify({wells:count,records:data.recordCount,period:data.period,selectedApi8:well.api8,verifiedMonth:record.month,verifiedBbl:record.bbl,missingHistoryDistinct:true,overlayCoexistence:true,errors}));assert.deepEqual(errors,[]);
}finally{await browser.close();}
