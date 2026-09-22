import test from 'node:test';
import assert from 'node:assert/strict';
import { etSelection, readableFacts } from './featureFacts.js';
import { publicOwnerSummary } from '../../server/providers/ownerWorkspace.js';
import { parseLandFilters } from '../../server/providers/land.js';

test('selected ET period and measure never fall back to another month or convert missing to zero', () => {
  const rows = [
    { period: '2018-07', kind: 'ET', value: 39.401 },
    { period: '2018-07', kind: 'ETo', value: 140 },
    { period: '2018-08', kind: 'ET', value: 0 },
    { period: '2018-09', kind: 'ET', value: null },
  ];
  assert.equal(etSelection(rows, '2018-07', 'ET').value, 39.401);
  assert.equal(etSelection(rows, '2018-07', 'ETo').value, 140);
  assert.equal(etSelection(rows, '2018-08', 'ET').value, 0);
  assert.equal(etSelection(rows, '2018-09', 'ET').value, null);
  assert.equal(etSelection(rows, '2018-10', 'ET').value, null);
  assert.equal(etSelection(rows, '', 'ET').value, null);
  assert.deepEqual(
    readableFacts({
      acres: 206.45556041704,
      run_uuid: 'internal',
      county_fips: 48303,
    }),
    [['Area · acres', '206.46']],
  );
});
test('missing-owner sentinel cannot become a shared owner filter or public owner group', async () => {
  assert.throws(
    () =>
      parseLandFilters(
        new URLSearchParams({ owners: JSON.stringify(['OWNER NOT SUPPLIED']) }),
      ),
    /Invalid/,
  );
  await assert.rejects(
    publicOwnerSummary(
      () => {
        throw Error('Must not query');
      },
      new URLSearchParams({ subject: 'owner:OWNER NOT SUPPLIED' }),
    ),
    /Invalid/,
  );
  await assert.rejects(
    publicOwnerSummary(
      () => {
        throw Error('Must not query');
      },
      new URLSearchParams({ subject: 'manual:private-id' }),
    ),
    /Invalid/,
  );
});
test('public owner summary only queries appraisal data and binds route parcel scope', async () => {
  const calls = [];
  const query = async (sql, args) => {
    calls.push({ sql, args });
    return {
      rows: sql.includes('count(*)')
        ? [{ n: 1 }]
        : sql.startsWith('SELECT name')
          ? [{ name: 'Test public owner' }]
          : [
              {
                id: '12',
                source_key: 'CAD12',
                area_acres: 5,
                county: 'Test',
                source: {},
                geometry: { type: 'Polygon', coordinates: [] },
              },
            ],
    };
  };
  const d = await publicOwnerSummary(
    query,
    new URLSearchParams({ subject: 'owner:TEST', parcels: '12,13' }),
  );
  assert.equal(d.sourceName, 'Test public owner');
  assert.equal(d.total, 1);
  assert.equal('profile' in d, false);
  assert.equal('history' in d, false);
  assert.ok(
    calls.every(
      (c) =>
        !c.sql.includes('owner_profile') && !c.sql.includes('owner_project'),
    ),
  );
  assert.deepEqual(calls[0].args, ['TEST', ['12', '13']]);
  await assert.rejects(
    publicOwnerSummary(
      query,
      new URLSearchParams({ subject: 'owner:TEST', parcels: 'bad' }),
    ),
    /Invalid route parcels/,
  );
});
