import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  validateOwnerRecord,
  ownerWorkspace,
} from '../../server/providers/ownerWorkspace.js';
import { landProxy } from '../../server/providers/land.js';
const data = {
  name: 'Test owner',
  relationship: 'not-assessed',
  sponsor: '',
  contact: '',
  notes: '',
  transaction: 'pipeline-easement',
  scope: '',
  willingness: 'unknown',
  confidence: 'low',
  basis: '',
  assessedOn: '',
  nextAction: '',
  followupOn: '',
};
test('unknown remains unknown; positive judgments require date, scope and basis', () => {
  const b = { project: '1', revision: 0, subject: 'owner:TEST', data };
  assert.equal(validateOwnerRecord(b).data.willingness, 'unknown');
  for (const changes of [
    { willingness: 'likely' },
    { assessedOn: '2026-02-30' },
    { willingness: '100%' },
    { notes: 'x'.repeat(4001) },
  ])
    assert.throws(() =>
      validateOwnerRecord({ ...b, data: { ...data, ...changes } }),
    );
  assert.throws(() =>
    validateOwnerRecord({ ...b, subject: 'owner:OWNER NOT SUPPLIED' }),
  );
  assert.notEqual(
    validateOwnerRecord({ ...b, subject: 'parcel:12' }).subject,
    validateOwnerRecord({ ...b, subject: 'parcel:13' }).subject,
  );
  assert.equal(
    validateOwnerRecord({
      ...b,
      data: {
        ...data,
        willingness: 'likely',
        scope: 'Easement on parcel 12',
        basis: 'Staff assessment only',
        assessedOn: '2026-09-21',
      },
    }).data.willingness,
    'likely',
  );
});
test('private reads and writes stop at membership check', async () => {
  let calls = [];
  const workspace = ownerWorkspace(() => ({
    query: async (sql) => {
      calls.push(sql);
      return { rows: [] };
    },
    connect: () => {
      throw Error('Must not write');
    },
  }));
  for (const path of ['/owner-profile', '/owner-directory'])
    await assert.rejects(
      workspace.get(
        path,
        new URLSearchParams({ project: '1', subject: 'owner:TEST' }),
        'outsider',
      ),
      (e) => e.status === 403,
    );
  await assert.rejects(
    workspace.save(
      { project: '1', revision: 0, subject: 'owner:TEST', data },
      'outsider',
    ),
    (e) => e.status === 403,
  );
  assert.ok(calls.every((sql) => sql.includes('owner_project_member')));
});
test('HTTP private endpoints reject missing actor and cross-origin writes', async () => {
  let handler;
  landProxy({ pool: { query: async () => ({ rows: [] }) } }).configureServer({
    middlewares: { use: (_, fn) => (handler = fn) },
  });
  async function call(method, url, headers = {}) {
    const req = Readable.from([]);
    Object.assign(req, { method, url, headers });
    let result;
    const res = {
      setHeader() {},
      end(text) {
        result = { status: this.statusCode, data: JSON.parse(text) };
      },
    };
    await handler(req, res);
    return result;
  }
  assert.equal(
    (await call('GET', '/owner-profile?project=1&subject=owner:TEST')).status,
    403,
  );
  assert.equal(
    (
      await call('POST', '/owner-profile', {
        'x-landman-write': '1',
        'content-type': 'application/json',
        origin: 'https://attacker.invalid',
      })
    ).status,
    403,
  );
});
