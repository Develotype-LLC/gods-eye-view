import test from 'node:test';
import assert from 'node:assert/strict';
import { historyWindow } from './motionHistory.js';
import {
  normalizeHistory,
  operaNationalProxy,
} from '../../server/providers/opera-national.js';
const p = (date, valueMm, masked = false) => ({
  date: date + 'T00:00:00Z',
  valueMm,
  masked,
});
test('period change uses actual observations, excludes masked and null values', () => {
  const out = historyWindow(
    [
      p('2023-12-29', 7),
      p('2024-12-29', 10),
      p('2025-07-01', null),
      p('2025-12-20', 999, true),
      p('2025-12-30', 25),
    ],
    'year',
  );
  assert.equal(out.changeMm, 15);
  assert.equal(out.start.slice(0, 10), '2024-12-29');
  assert.equal(out.points.length, 2);
  assert.equal(out.maxGapDays, 366);
  assert.match(
    historyWindow([p('2024-12-29', 10), p('2025-12-30', 25)], 'ten').error,
    /enough history/,
  );
});
test('national histories separate frames, convert meters once and retain missing quality', () => {
  const raw = {};
  for (const [frame, value] of [
    ['F20697', 0.012],
    ['F12345', null],
  ])
    raw[`OPERA_L3_DISP-S1_IW_${frame}_VV_test.nc`] = {
      secondary_datetime: '2025-12-30T00:00:00',
      short_wavelength_displacement: value,
    };
  raw.mean = { short_wavelength_displacement: 50 };
  const rows = normalizeHistory(raw);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].points[0].valueMm, 12);
  assert.equal(rows[0].points[0].qualityReported, false);
  assert.equal(rows[1].points[0].valueMm, null);
});
test('history proxy validates coordinates and coalesces requests to fixed provider', async () => {
  let handler,
    calls = 0;
  operaNationalProxy({
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://d2qmcvu7qty7vn.cloudfront.net/timeseries');
      assert.equal(JSON.parse(options.body).wkt, 'POINT(-102.60490 31.40070)');
      return new Response('{}');
    },
  }).configureServer({
    middlewares: {
      use(path, fn) {
        if (path.endsWith('/history')) handler = fn;
      },
    },
  });
  async function request(url) {
    let status, body;
    await handler(
      { method: 'GET', url },
      {
        set statusCode(x) {
          status = x;
        },
        setHeader() {},
        end(x) {
          body = JSON.parse(x);
        },
      },
    );
    return { status, body };
  }
  assert.equal((await request('/?longitude=&latitude=31')).status, 400);
  assert.equal((await request('/?longitude=5&latitude=100')).status, 400);
  const answers = await Promise.all([
    request('/?longitude=-102.6049&latitude=31.4007'),
    request('/?longitude=-102.6049&latitude=31.4007'),
  ]);
  assert.equal(calls, 1);
  assert.equal(answers[0].status, 200);
  assert.deepEqual(answers[0].body.series, []);
});
test('tiles validate indices, retain PNG bytes and cache transparent missing coverage', async () => {
  let handler,
    calls = 0;
  operaNationalProxy({
    fetchImpl: async () => {
      calls++;
      return new Response(null, { status: 404 });
    },
  }).configureServer({
    middlewares: {
      use(path, fn) {
        if (path.endsWith('/tiles')) handler = fn;
      },
    },
  });
  async function request(url) {
    let status = 200,
      body;
    await handler(
      { method: 'GET', url },
      {
        set statusCode(x) {
          status = x;
        },
        setHeader() {},
        end(x) {
          body = x;
        },
      },
    );
    return { status, body };
  }
  assert.equal((await request('/asc/13/0/0.png')).status, 400);
  assert.equal((await request('/asc/2/9/0.png')).status, 400);
  assert.equal((await request('/asc/2/0/0.png?url=evil')).status, 400);
  const a = await request('/asc/2/0/0.png');
  assert.equal(a.status, 200);
  assert.equal(a.body.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  await request('/asc/2/0/0.png');
  assert.equal(calls, 1);
});
