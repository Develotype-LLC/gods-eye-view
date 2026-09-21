import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLandFilters, landProxy } from '../../server/providers/land.js';
test('land filters reject unbounded or invalid selections', () => {
  assert.deepEqual(parseLandFilters(new URLSearchParams()), [
    'both',
    '',
    '',
    [],
    false,
    'appraisal',
  ]);
  for (const q of [
    'basin=world',
    'role=verified-title',
    'client=1%20OR%20true',
    'interest=operator',
    'owners={}',
    'owners=%5B1%5D',
  ])
    assert.throws(() => parseLandFilters(new URLSearchParams(q)), /Invalid/);
  assert.throws(
    () =>
      parseLandFilters(
        new URLSearchParams({ owners: JSON.stringify(Array(51).fill('X')) }),
      ),
    /Invalid/,
  );
});
function harness() {
  let handler;
  const calls = [];
  const pool = {
    query: async (sql, args) => {
      calls.push({ sql, args });
      if (sql.includes(' AS total'))
        return {
          rows: [{ total: 0, acres: 0, bounds: [null, null, null, null] }],
        };
      if (sql.includes(' AS n')) return { rows: [{ n: 0 }] };
      return { rows: [] };
    },
  };
  landProxy({ pool }).configureServer({
    middlewares: { use: (path, fn) => (handler = fn) },
  });
  return {
    calls,
    run: async (url, method = 'GET', headers = {}) => {
      let code, body;
      await handler(
        { url, method, headers },
        {
          set statusCode(v) {
            code = v;
          },
          setHeader() {},
          end(v) {
            body = JSON.parse(v);
          },
        },
      );
      return { code, body };
    },
  };
}
test('geometry totals use EXISTS rather than duplicating owner/account joins', async () => {
  const h = harness();
  const r = await h.run(
    '/viewport?bbox=-104,30,-102,32&role=midstream&candidates=true',
  );
  assert.equal(r.code, 200);
  const total = h.calls.find((c) => c.sql.includes(' AS total'));
  assert.match(total.sql, /EXISTS\(SELECT 1 FROM landman.land_account/);
  assert.match(total.sql, /cardinality\(p.basins\)>0/);
  assert.equal(total.args[1], 'midstream');
  assert.equal(total.args[4], true);
});
test('writes reject cross-origin or missing application write headers before database access', async () => {
  const h = harness();
  assert.equal((await h.run('/clients', 'POST', {})).code, 403);
  assert.equal(
    (
      await h.run('/clients', 'POST', {
        'x-landman-write': '1',
        'content-type': 'application/json',
        origin: 'https://evil.example',
      })
    ).code,
    403,
  );
  assert.equal(h.calls.length, 0);
});
