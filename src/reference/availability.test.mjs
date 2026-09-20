import test from 'node:test';
import assert from 'node:assert/strict';
import {groundMotionProxy, normalizeOperaEntry} from '../../server/providers/ground-motion.js';
const title = 'OPERA_L3_DISP-S1_IW_F20697_VV_20250727T005058Z_20251230T005058Z_v1.0_20260306T223452Z';
function middleware(plugin) {let handler; plugin.configureServer({middlewares: {use(path, fn) {assert.equal(path, '/api/reference/ground-motion/availability'); handler = fn;}}}); return handler;}
async function request(handler, url = '/', method = 'GET') {let code, body; await handler({url, method}, {set statusCode(v) {code = v;}, setHeader() {}, end(s) {body = JSON.parse(s);}}); return {code, body};}
test('acquisition date is distinct from reference and processing dates', () => {
  const result = normalizeOperaEntry({title});
  assert.equal(result.acquisitionDate, '2025-12-30T00:50:58Z');
  assert.equal(result.referenceDate, '2025-07-27T00:50:58Z');
  assert.equal(result.processedAt, '2026-03-06T22:34:52Z');
  assert.throws(() => normalizeOperaEntry({title: title.replace('F20697', 'F11111')}));
});
test('fixed upstream, concurrent checks coalesce and metadata caches without credentials', async () => {
  let calls = 0;
  const handler = middleware(groundMotionProxy({fetchImpl: async (url, options) => {
    calls++; assert.equal(new URL(url).hostname, 'cmr.earthdata.nasa.gov'); assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, undefined);
    return new Response(JSON.stringify({feed: {entry: [{title}]}}), {headers: {'CMR-Hits': '269'}});
  }}));
  const result = await Promise.all([request(handler), request(handler)]);
  assert.equal(calls, 1); assert.equal(result[0].body.granuleCount, 269); assert.equal(result[1].code, 200);
  await request(handler); assert.equal(calls, 1);
  assert.equal((await request(handler, '/?url=https://example.com')).code, 400);
  assert.equal((await request(handler, '/', 'POST')).code, 405);
});
test('failed catalog check is explicit and backed off, never passed off as current data', async () => {
  let calls = 0;
  const handler = middleware(groundMotionProxy({fetchImpl: async () => {calls++; throw new Error('unavailable');}}));
  assert.equal((await request(handler)).code, 502); assert.equal((await request(handler)).code, 502); assert.equal(calls, 1);
});
