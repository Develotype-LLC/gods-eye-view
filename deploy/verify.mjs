import { readFile, writeFile, mkdir } from 'node:fs/promises';
import puppeteer from 'puppeteer';

const credentials = JSON.parse(await readFile(new URL('./.secrets/viewer.json', import.meta.url)));
const base = credentials.url;
const auth = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`;
const checks = [];
for (const [path, authenticated, expected] of [
  ['/', false, 401], ['/healthz', false, 200], ['/', true, 200],
  ['/api/terrain/heights', false, 401], ['/src/app/application.js', false, 401],
]) {
  const response = await fetch(base + path, { headers: authenticated ? { Authorization: auth } : {} });
  checks.push({path, authenticated, status: response.status, expected});
  if (response.status !== expected) throw new Error(`Unexpected status for ${path}: ${response.status}`);
}
if (process.env.VERIFY_GOOGLE_3D === '1') {
  const route = '/api/google/geocode?address=Midland%20Texas';
  const denied = await fetch(base + route);
  if (denied.status !== 401) throw new Error('Geocoding must require authentication');
  const response = await fetch(base + route, {headers: {Authorization: auth}});
  const data = await response.json();
  checks.push({path: route, authenticated: true, status: response.status, providerStatus: data.status});
  if (!response.ok || data.status !== 'OK' || !data.results?.length) throw new Error('Live geocoding failed');
}
const browser = await puppeteer.launch({headless: true});
const redact = value => String(value).replace(/AIza[\w-]+/g, '[REDACTED]').replace(/([?&](?:key|token|session)=)[^\s&"']+/gi, '$1[REDACTED]');
try {
  const page = await browser.newPage();
  await page.setViewport({width: 1440, height: 1000});
  await page.authenticate({username: credentials.username, password: credentials.password});
  const errors = [];
  const googleTiles = {root: {}, content: {}};
  page.on('pageerror', e => errors.push(redact(e.message)));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.hostname !== 'tile.googleapis.com' || !url.pathname.startsWith('/v1/3dtiles/')) return;
    const group = url.pathname.endsWith('/root.json') ? googleTiles.root : googleTiles.content;
    group[response.status()] = (group[response.status()] || 0) + 1;
  });
  await page.goto(base, {waitUntil: 'domcontentloaded', timeout: 60000});
  await page.waitForSelector('canvas', {timeout: 60000});
  await new Promise(resolve => setTimeout(resolve, 5000));
  await page.click('[data-first-run-choice="explore"]');
  await page.click('[data-collapse-target="data-panel"]');
  await page.waitForFunction(() => !document.querySelector('#data-panel').classList.contains('collapsed'));
  await new Promise(resolve => setTimeout(resolve, 2000));
  if (process.env.VERIFY_GOOGLE_3D === '1') {
    for (let attempt = 0; attempt < 30 && !googleTiles.content[200]; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    await page.waitForFunction(() => window.__godsEyeView?.tileset?.tilesLoaded === true, {timeout: 60000});
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  const text = await page.evaluate(() => document.body.innerText);
  await mkdir(new URL('../screenshots/', import.meta.url), {recursive: true});
  await page.screenshot({path: new URL('../screenshots/hosted-baseline.png', import.meta.url).pathname});
  const result = {url: base, checks, title: await page.title(), errors, googleTiles, text: redact(text.slice(0, 9000)),
    canvasCount: await page.$$eval('canvas', elements => elements.length)};
  await writeFile(new URL('./verification.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  if (errors.length || (process.env.VERIFY_GOOGLE_3D === '1' && (!googleTiles.root[200] || !googleTiles.content[200]))) process.exitCode = 1;
} finally {
  await browser.close();
}
