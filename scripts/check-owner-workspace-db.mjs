/** Run as godseye in CT110. All data writes rolled back, including history. */
import assert from 'node:assert/strict';
import pg from 'pg';
import { ownerWorkspace } from '../server/providers/ownerWorkspace.js';
import { analyzeCorridors } from '../server/providers/pipeline.js';
const db = new pg.Client({
  host: '/var/run/postgresql',
  database: 'landman',
  user: 'godseye',
  statement_timeout: 20000,
});
await db.connect();
await db.query('BEGIN');
try {
  const conn = {
    query: (s, a) =>
      db.query(
        s === 'BEGIN'
          ? 'SAVEPOINT owner_qa'
          : s === 'COMMIT'
            ? 'RELEASE SAVEPOINT owner_qa'
            : s === 'ROLLBACK'
              ? 'ROLLBACK TO SAVEPOINT owner_qa'
              : s,
        a,
      ),
    release() {},
  };
  const workspace = ownerWorkspace(() => ({
    query: (...args) => db.query(...args),
    connect: async () => conn,
  }));
  const project = String(
    (
      await db.query(
        "INSERT INTO landman.owner_project(name,created_by) VALUES('ROLLBACK QA','qa-brian') RETURNING id",
      )
    ).rows[0].id,
  );
  await db.query(
    "INSERT INTO landman.owner_project_member(project_id,actor) VALUES($1,'qa-brian'),($1,'qa-dia')",
    [project],
  );
  const subject = 'manual:00000000-0000-4000-8000-000000000001';
  const data = {
    name: 'ROLLBACK QA only',
    relationship: 'existing-relationship',
    sponsor: 'QA',
    contact: '',
    notes: 'Never persist',
    transaction: 'pipeline-easement',
    scope: 'QA proposal',
    willingness: 'likely',
    confidence: 'low',
    basis: 'Synthetic QA assessment',
    assessedOn: '2026-09-21',
    nextAction: '',
    followupOn: '',
  };
  const a = await workspace.save(
    { project, subject, revision: 0, data },
    'qa-brian',
  );
  assert.equal(a.profile.revision, 1);
  const b = await workspace.save(
    {
      project,
      subject,
      revision: 1,
      data: { ...data, transaction: 'surface-sale', willingness: 'declined' },
    },
    'qa-dia',
  );
  assert.equal(
    b.profile.data.assessments['pipeline-easement'].willingness,
    'likely',
  );
  assert.equal(
    b.profile.data.assessments['surface-sale'].willingness,
    'declined',
  );
  await assert.rejects(
    workspace.save({ project, subject, revision: 1, data }, 'qa-brian'),
    (e) => e.status === 409,
  );
  const q = new URLSearchParams({ project, subject });
  const read = await workspace.get('/owner-profile', q, 'qa-brian');
  assert.equal(read.history.length, 2);
  assert.equal(read.profile.updated_by, 'qa-dia');
  await assert.rejects(
    workspace.get('/owner-profile', q, 'unauthorized'),
    (e) => e.status === 403,
  );
  const privateProject = await workspace.createProject(
    { name: 'Rollback private project' },
    'qa-brian',
  );
  await assert.rejects(
    workspace.get(
      '/owner-directory',
      new URLSearchParams({ project: String(privateProject.project.id) }),
      'qa-dia',
    ),
    (e) => e.status === 403,
  );
  const routes = await analyzeCorridors((...args) => db.query(...args), {
    width: 30,
    routes: [
      {
        id: 'route-0',
        coordinates: [
          [-102.3688, 31.6783],
          [-102.32, 31.7],
        ],
      },
    ],
  });
  const route = routes.results[0];
  assert.ok(route.parcelCount > 0);
  assert.equal(route.unknownParcels, route.unresolved.length);
  for (const owner of route.owners)
    assert.equal(owner.parcels, owner.parcel_ids.length);
  const source = (
    await db.query(
      "SELECT a.owner_key,a.parcel_id::text AS parcel FROM landman.land_account a JOIN landman.land_parcel p ON p.id=a.parcel_id WHERE cardinality(p.basins)>0 AND a.owner_key <> 'OWNER NOT SUPPLIED' LIMIT 1",
    )
  ).rows[0];
  const mapped = await workspace.get(
    '/owner-profile',
    new URLSearchParams({
      project,
      subject: 'owner:' + source.owner_key,
      parcels: source.parcel,
    }),
    'qa-brian',
  );
  assert.equal(mapped.total, 1);
  assert.equal(mapped.parcels[0].id, source.parcel);
  const unknown = await workspace.get(
    '/owner-profile',
    new URLSearchParams({ project, subject: 'parcel:' + source.parcel }),
    'qa-dia',
  );
  assert.equal(unknown.total, 1);
  console.log(
    'PASS: scoped reads/writes, independent transactions, optimistic concurrency, audit history, mapped parcel detail; all writes rolled back.',
  );
} finally {
  await db.query('ROLLBACK');
  await db.end();
}
