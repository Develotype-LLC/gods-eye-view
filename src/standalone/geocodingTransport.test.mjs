import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeocodingTransport } from './geocodingTransport.js';
import { googleGeocodingProxy } from '../../server/providers/places/geocoding.js';

test('standalone forward and reverse requests use the authenticated route without a browser key', async () => {
  const calls = [];
  const transport = createGeocodingTransport(async (url) => calls.push(url));
  await transport('https://maps.googleapis.com/maps/api/geocode/json?address=Midland&key=browser-secret');
  await transport('https://maps.googleapis.com/maps/api/geocode/json?latlng=32,-102&key=browser-secret');
  await transport('/api/unrelated');
  assert.deepEqual(calls, ['/api/google/geocode?address=Midland', '/api/google/geocode?latlng=32%2C-102', '/api/unrelated']);
});

function harness(options) {
  let handle;
  const plugin = googleGeocodingProxy(options);
  plugin.configurePreviewServer({middlewares: {use(path, handler) {
    assert.equal(path, '/api/google/geocode'); handle = handler;
  }}});
  return async (url, method = 'GET') => {
    let body;
    const res = {setHeader() {}, end(value) {body = JSON.parse(value);}};
    await handle({url, method}, res);
    return {status: res.statusCode, body};
  };
}

test('proxy uses only the server key and fixed Google destination', async () => {
  let upstream;
  const request = harness({resolveApiKey: () => 'server-secret', fetchImpl: async (url) => {
    upstream = new URL(url);
    return Response.json({status: 'OK', results: [{formatted_address: 'Midland, TX'}]});
  }});
  const result = await request('/?address=Midland&key=attacker&url=http://localhost');
  assert.equal(result.status, 200);
  assert.equal(upstream.origin, 'https://maps.googleapis.com');
  assert.equal(upstream.searchParams.get('key'), 'server-secret');
  assert.equal(upstream.searchParams.has('url'), false);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('invalid coordinates, ambiguous queries and methods do not contact Google', async () => {
  const request = harness({resolveApiKey: () => 'fixture', fetchImpl: () => assert.fail('No upstream call expected')});
  for (const query of ['/', '/?latlng=91,0', '/?latlng=,', '/?address=a&latlng=0,0']) {
    assert.equal((await request(query)).status, 400);
  }
  assert.equal((await request('/?address=Midland', 'POST')).status, 405);
});

test('provider errors and exception URLs never disclose keys', async () => {
  for (const fetchImpl of [
    async () => Response.json({status: 'REQUEST_DENIED', error_message: 'secret'}),
    async () => {throw new Error('https://example.com/?key=secret');},
  ]) {
    const response = await harness({resolveApiKey: () => 'secret', fetchImpl})('/?address=Midland');
    assert.equal(response.status, 502);
    assert.equal(JSON.stringify(response).includes('secret'), false);
  }
});

test('geocoder has a bounded paid request rate', async () => {
  let calls = 0;
  const request = harness({resolveApiKey: () => 'fixture', fetchImpl: async () => {
    calls++;
    return Response.json({status: 'ZERO_RESULTS', results: []});
  }});
  for (let i = 0; i < 30; i++) assert.equal((await request('/?address=Midland')).status, 200);
  assert.equal((await request('/?address=Midland')).status, 429);
  assert.equal(calls, 30);
});
