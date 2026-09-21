import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const c=JSON.parse(await readFile(new URL('./.secrets/viewer.json',import.meta.url)));
const browser=await puppeteer.launch({headless:true});
try {
 const page=await browser.newPage(); await page.setViewport({width:1440,height:1000}); await page.authenticate({username:c.username,password:c.password});
 const errors=[];page.on('pageerror',e=>errors.push(e.message.replace(/AIza[\w-]+/g,'[REDACTED]')));
 await page.goto(c.url,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForSelector('[data-first-run-choice="explore"]',{visible:true});await page.click('[data-first-run-choice="explore"]');
 await page.waitForFunction(()=>window.__godsEyeView?.dataManager);
 await page.click('#open-reference-library');await page.type('#reference-library input[type=search]','US geological basins');await page.click('#reference-library nav button');
 await page.waitForFunction(()=>document.querySelector('#reference-library .ref-primary')?.textContent==='View US geological basins');await page.click('#reference-library .ref-primary');
 await page.waitForSelector('#basins-panel',{visible:true,timeout:60000});
 await page.waitForFunction(()=>window.__godsEyeView.viewer.camera.positionCartographic.height>1000000);
 const result=await page.evaluate(()=>{const v=window.__godsEyeView.viewer,s=v.dataSources.getByName('USGS geological basins')[0];return {polygons:s.entities.values.filter(e=>e.polygon).length,lines:s.entities.values.filter(e=>e.polyline).length,names:[...document.querySelector('#basins-panel select').options].map(o=>o.text)};});
 assert.equal(result.names.length,145);assert.ok(result.polygons>=144);assert.ok(result.lines>=144);assert.ok(result.names.some(n=>n.includes('Hawaii')));assert.ok(result.names.some(n=>n.includes('Permian')));
 await new Promise(r=>setTimeout(r,3500));await mkdir(new URL('../screenshots/',import.meta.url),{recursive:true});await page.screenshot({path:new URL('../screenshots/us-basins.png',import.meta.url).pathname});
 const permian=await page.$eval('#basins-panel select',e=>[...e.options].find(o=>o.text.includes('Permian')).value);await page.select('#basins-panel select',permian);
 await page.waitForFunction(()=>document.querySelector('#basins-panel p').textContent.includes('Source scale'));
 await new Promise(r=>setTimeout(r,2000));await page.screenshot({path:new URL('../screenshots/permian-basin.png',import.meta.url).pathname});
 await page.evaluate(()=>window.__godsEyeView.dataManager.setEnabled('us-basins',false,{origin:'user'}));await page.waitForSelector('#basins-panel',{hidden:true});
 assert.equal(await page.evaluate(()=>window.__godsEyeView.viewer.dataSources.getByName('USGS geological basins').length),0);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({...result,names:result.names.length,errors}));
} finally {await browser.close();}
