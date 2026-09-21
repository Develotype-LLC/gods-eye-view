/** Run as godseye inside CT110. All write checks are rolled back. */
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import pg from 'pg';
import { landProxy } from '../server/providers/land.js';
const db = new pg.Client({
  host: '/var/run/postgresql',
  database: 'landman',
  user: 'godseye',
  statement_timeout: 20000,
});
await db.connect();
await db.query('BEGIN');
try {
  const owner = (
    await db.query(
      'SELECT a.owner_key FROM landman.land_account a JOIN landman.land_parcel p ON p.id=a.parcel_id WHERE cardinality(p.basins)>0 LIMIT 1',
    )
  ).rows[0].owner_key;
  const nested = {
    query: (sql, args) =>
      db.query(
        sql === 'BEGIN'
          ? 'SAVEPOINT qa_write'
          : sql === 'COMMIT'
            ? 'RELEASE SAVEPOINT qa_write'
            : sql === 'ROLLBACK'
              ? 'ROLLBACK TO SAVEPOINT qa_write'
              : sql,
        args,
      ),
    release() {},
  };
  const pool = {
    query: (...args) => db.query(...args),
    connect: async () => nested,
  };
  let handler;
  landProxy({ pool }).configureServer({
    middlewares: {
      use(_path, fn) {
        handler = fn;
      },
    },
  });
  async function call(url, body) {
    let output;
    const req = Readable.from(body ? [JSON.stringify(body)] : []);
    req.method = body ? 'POST' : 'GET';
    req.url = url;
    req.headers = {
      'x-landman-write': '1',
      'content-type': 'application/json',
      origin: 'https://landman.develotype.com',
      'x-landman-user': 'rollback QA',
    };
    const res = {
      statusCode: 200,
      setHeader() {},
      end(s) {
        output = JSON.parse(s);
      },
    };
    await handler(req, res);
    assert.equal(res.statusCode, 200, JSON.stringify(output));
    return output;
  }
  const name = '__rollback_land_check_' + Date.now();
  const saved = await call('/clients', { name, owners: [owner] });
  const stored = (
    await db.query('SELECT created_by FROM landman.land_client WHERE id=$1', [
      saved.id,
    ])
  ).rows[0];
  assert.equal(stored.created_by, 'rollback QA');
  const bounds = 'bbox=-107,25,-93,37';
  const viaOwner = await call(
    '/viewport?' +
      bounds +
      '&owners=' +
      encodeURIComponent(JSON.stringify([owner])),
  );
  const viaClient = await call('/viewport?' + bounds + '&client=' + saved.id);
  assert.equal(viaOwner.summary.total, viaClient.summary.total);
  assert.ok(Math.abs(viaOwner.summary.acres - viaClient.summary.acres) < 1e-6);
  assert.ok(viaClient.summary.total > 0);
  await call('/classify', {
    owner,
    roles: ['upstream', 'holdco'],
    note: 'QA transaction only; rolled back, not ownership evidence.',
  });
  const audit = (
    await db.query(
      'SELECT roles,actor FROM landman.land_owner_review_log WHERE owner_key=$1 ORDER BY id DESC LIMIT 1',
      [owner],
    )
  ).rows[0];
  assert.deepEqual(audit.roles, ['upstream', 'holdco']);
  assert.equal(audit.actor, 'rollback QA');
  const classified = await call(
    '/viewport?' +
      bounds +
      '&role=holdco&owners=' +
      encodeURIComponent(JSON.stringify([owner])),
  );
  assert.equal(classified.summary.total, viaOwner.summary.total);
  assert.ok(Math.abs(classified.summary.acres - viaOwner.summary.acres) < 1e-6);
  console.log(
    'PASS: real SQL, client membership, authenticated actor, classification audit, and deduplicated acreage. All writes rolled back.',
  );
} finally {
  await db.query('ROLLBACK');
  await db.end();
}
