import {readFile, mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
const credentials = JSON.parse(await readFile(new URL('./.secrets/viewer.json', import.meta.url)));
const base = credentials.url;
const auth = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`;
for (const path of ['/reference-data/heavenwatch/manifest.json', '/reference-data/heavenwatch/displacement.png', '/reference-data/heavenwatch/displacement.f32', '/api/reference/ground-motion/availability']) {
  assert.equal((await fetch(base + path)).status, 401, `${path} requires authentication`);
  const response = await fetch(base + path, {headers: {Authorization: auth}});
  assert.equal(response.status, 200, `${path} installed`);
  if (path.endsWith('/availability')) {const data = await response.json(); assert.equal(data.frame, 'F20697'); console.log(JSON.stringify({collection: data.collection, latest: data.latest.acquisitionDate, granules: data.granuleCount}));}
  else await response.arrayBuffer();
}
const browser = await puppeteer.launch({headless: true});
try {
  const page = await browser.newPage(); await page.setViewport({width: 1440, height: 1000});
  await page.authenticate({username: credentials.username, password: credentials.password});
  const errors = []; page.on('pageerror', error => errors.push(error.message.replace(/AIza[\w-]+/g, '[REDACTED]')));
  await page.goto(base, {waitUntil: 'domcontentloaded', timeout: 60_000});
  await page.waitForSelector('[data-first-run-choice="explore"]', {visible: true});
  await page.click('[data-first-run-choice="explore"]');
  await page.waitForFunction(() => window.__godsEyeView?.dataManager);
  await page.click('#open-reference-library');
  await page.type('#reference-library input[type=search]', 'Ground movement');
  await page.click('#reference-library nav button');
  await page.waitForSelector('#reference-library[open] .ref-primary');
  assert.equal(await page.$$eval('#reference-library nav button', items => items.length), 1);
  await page.click('[data-check-nasa]');
  await page.waitForFunction(() => document.querySelector('#reference-library [role=status]')?.textContent.includes('latest acquisition'));
  await mkdir(new URL('../screenshots/', import.meta.url), {recursive: true});
  await page.screenshot({path: new URL('../screenshots/reference-library.png', import.meta.url).pathname});
  await page.click('#reference-library .ref-primary');
  await page.waitForSelector('#ground-motion-legend', {visible: true});
  await page.waitForFunction(() => !document.querySelector('#reference-library').open);
  await new Promise(resolve => setTimeout(resolve, 5000));
  const state = await page.evaluate(() => ({enabled: window.__godsEyeView.dataManager.isEnabled('ground-motion'), stack: window.__godsEyeView.mapStackController.getActiveStack().id}));
  assert.equal(state.enabled, true); assert.equal(state.stack, 'esri-imagery');
  await page.mouse.click(720, 500);
  await page.waitForFunction(() => /mm\/year LOS/.test(document.querySelector('[data-sample]')?.textContent));
  const pixel = await page.$eval('[data-sample]', node => node.textContent);
  await page.screenshot({path: new URL('../screenshots/ground-motion.png', import.meta.url).pathname});
  await page.select('#ground-motion-legend [data-variant]', 'short_wavelength_displacement');
  await new Promise(resolve => setTimeout(resolve, 1500));
  await page.mouse.click(720, 500);
  await page.waitForFunction(() => /mm\/year LOS/.test(document.querySelector('[data-sample]')?.textContent));
  const alternate = await page.$eval('[data-sample]', node => node.textContent);
  await page.$eval('#ground-motion-legend [data-opacity]', node => {node.value = '0.35'; node.dispatchEvent(new Event('input', {bubbles: true}));});
  await page.click('[data-hide]');
  await page.waitForSelector('#ground-motion-legend', {hidden: true});
  assert.equal(await page.evaluate(() => window.__godsEyeView.dataManager.isEnabled('ground-motion')), false);
  await page.click('#open-reference-library');
  await page.$eval('#reference-library input[type=search]', node => {node.value='';node.dispatchEvent(new Event('input'));});
  await page.type('#reference-library input[type=search]', 'pipelines');
  await page.click('#reference-library nav button');
  assert.equal(await page.$('#reference-library .ref-primary'), null);
  console.log(JSON.stringify({state, pixel, alternate, plannedLayerHasNoToggle: true, errors}));
  assert.deepEqual(errors, []);
} finally {await browser.close();}
