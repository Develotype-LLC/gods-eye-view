const fail = (status, message) => Object.assign(new Error(message), { status });
const validId = (v) => typeof v === 'string' && /^\d{1,14}$/.test(v);
export function validateOwnerRecord(body) {
  if (
    !body ||
    !validId(String(body.project || '')) ||
    !Number.isInteger(body.revision) ||
    body.revision < 0
  )
    throw fail(400, 'Invalid project or revision');
  if (
    typeof body.subject !== 'string' ||
    body.subject.length > 340 ||
    !/^(owner:|parcel:|manual:)/.test(body.subject) ||
    body.subject === 'owner:OWNER NOT SUPPLIED'
  )
    throw fail(400, 'Invalid owner or parcel subject');
  if (body.subject.startsWith('parcel:') && !validId(body.subject.slice(7)))
    throw fail(400, 'Invalid parcel subject');
  if (
    body.subject.startsWith('manual:') &&
    !/^[a-f0-9-]{36}$/.test(body.subject.slice(7))
  )
    throw fail(400, 'Invalid manual owner ID');
  const input = body.data;
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw fail(400, 'Invalid record');
  const choices = {
    relationship: [
      'not-assessed',
      'no-known-relationship',
      'introduction-available',
      'existing-relationship',
    ],
    transaction: [
      'pipeline-easement',
      'surface-sale',
      'temporary-access',
      'lease',
      'commercial-agreement',
    ],
    willingness: ['unknown', 'unlikely', 'possible', 'likely', 'declined'],
    confidence: ['low', 'medium', 'high'],
  };
  const data = {};
  for (const [key, options] of Object.entries(choices)) {
    if (!options.includes(input[key])) throw fail(400, `Invalid ${key}`);
    data[key] = input[key];
  }
  for (const [key, max] of Object.entries({
    sponsor: 120,
    contact: 500,
    notes: 4000,
    basis: 2000,
    scope: 1000,
    nextAction: 500,
    assessedOn: 10,
    followupOn: 10,
    name: 200,
  })) {
    if (typeof input[key] !== 'string' || input[key].length > max)
      throw fail(400, `Invalid ${key}`);
    data[key] = input[key].trim();
  }
  if (!data.name) throw fail(400, 'Invalid name');
  for (const key of ['assessedOn', 'followupOn'])
    if (
      data[key] &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(data[key]) ||
        !Number.isFinite(Date.parse(data[key])) ||
        new Date(data[key]).toISOString().slice(0, 10) !== data[key])
    )
      throw fail(400, `Invalid ${key}`);
  if (
    data.willingness !== 'unknown' &&
    (data.basis.length < 5 || !data.assessedOn || !data.scope)
  )
    throw fail(
      400,
      'An assessment needs a date, parcel/proposal scope and evidence or rationale',
    );
  return {
    project: String(body.project),
    subject: body.subject,
    revision: body.revision,
    data,
  };
}
export function ownerWorkspace(db) {
  async function access(project, actor) {
    if (!actor || !validId(String(project)))
      throw fail(403, 'Project access required');
    const r = await db().query(
      'SELECT p.id,p.name FROM landman.owner_project p JOIN landman.owner_project_member m ON m.project_id=p.id WHERE p.id=$1 AND m.actor=$2',
      [project, actor],
    );
    if (!r.rows.length) throw fail(403, 'Project access denied');
    return r.rows[0];
  }
  async function get(path, q, actor) {
    if (!actor) throw fail(403, 'Sign in to use the owner workspace');
    if (path === '/owner-projects')
      return {
        projects: (
          await db().query(
            'SELECT p.id,p.name FROM landman.owner_project p JOIN landman.owner_project_member m ON m.project_id=p.id WHERE m.actor=$1 ORDER BY p.id',
            [actor],
          )
        ).rows,
      };
    const project = await access(q.get('project'), actor);
    if (path === '/owner-directory') {
      const term = (q.get('q') || '').trim(),
        relationship = q.get('relationship') || '',
        due = q.get('due') || '',
        sponsor = (q.get('sponsor') || '').trim();
      if (
        term.length > 100 ||
        sponsor.length > 120 ||
        ![
          '',
          'not-assessed',
          'no-known-relationship',
          'introduction-available',
          'existing-relationship',
        ].includes(relationship) ||
        !['', 'due', 'undated'].includes(due)
      )
        throw fail(400, 'Invalid worklist filters');
      const pattern = (value) => '%' + value.replace(/[\\%_]/g, '\\$&') + '%';
      return {
        profiles: (
          await db().query(
            `SELECT id,subject,name,revision,updated_by,updated_at,data->>'relationship' AS relationship,data->>'willingness' AS willingness,data->>'transaction' AS transaction,data->>'followupOn' AS followup,data->>'sponsor' AS sponsor,data->>'nextAction' AS next_action FROM landman.owner_profile WHERE project_id=$1
        AND ($2='' OR name ILIKE $3) AND ($4='' OR data->>'relationship'=$4)
        AND ($5='' OR ($5='due' AND NULLIF(data->>'followupOn','')<=CURRENT_DATE::text) OR ($5='undated' AND NULLIF(data->>'followupOn','') IS NULL))
        AND ($6='' OR data->>'sponsor' ILIKE $7)
        ORDER BY NULLIF(data->>'followupOn','') ASC NULLS LAST,updated_at DESC LIMIT 201`,
            [
              project.id,
              term,
              pattern(term),
              relationship,
              due,
              sponsor,
              pattern(sponsor),
            ],
          )
        ).rows,
      };
    }
    const subject = q.get('subject') || '';
    if (
      subject.length > 340 ||
      !/^(owner:|parcel:|manual:)/.test(subject) ||
      subject === 'owner:OWNER NOT SUPPLIED'
    )
      throw fail(400, 'Invalid subject');
    const profile =
      (
        await db().query(
          'SELECT * FROM landman.owner_profile WHERE project_id=$1 AND subject=$2',
          [project.id, subject],
        )
      ).rows[0] || null;
    const history = profile
      ? (
          await db().query(
            'SELECT revision,actor,recorded_at,data FROM landman.owner_profile_history WHERE profile_id=$1 ORDER BY revision DESC LIMIT 20',
            [profile.id],
          )
        ).rows
      : [];
    let parcels = [],
      sourceName = profile?.name || '',
      total = 0;
    if (!subject.startsWith('manual:')) {
      const byParcel = subject.startsWith('parcel:');
      if (byParcel && !validId(subject.slice(7)))
        throw fail(400, 'Invalid parcel');
      const key = subject.slice(byParcel ? 7 : 6);
      const route = q.get('parcels');
      let ids = [];
      if (route) {
        ids = route.split(',');
        if (ids.length > 3000 || ids.some((id) => !validId(id)))
          throw fail(400, 'Invalid route parcels');
      }
      const where = byParcel
        ? 'p.id=$1::bigint'
        : `EXISTS(SELECT 1 FROM landman.land_account a WHERE a.parcel_id=p.id AND a.owner_key=$1)`;
      const args = [key, ids];
      const from = `FROM landman.land_parcel p JOIN landman.land_county c ON c.snapshot_id=p.snapshot_id JOIN landman.land_snapshot s ON s.id=p.snapshot_id WHERE ${where} AND (cardinality($2::bigint[])=0 OR p.id=ANY($2::bigint[]))`;
      total = Number(
        (await db().query('SELECT count(*)::int AS n ' + from, args)).rows[0].n,
      );
      parcels = (
        await db().query(
          `SELECT p.id,p.source_key,p.area_acres,c.name AS county,s.metadata AS source,ST_AsGeoJSON(ST_SimplifyPreserveTopology(p.geom,0.00001),6)::json AS geometry ${from} ORDER BY p.id LIMIT 100`,
          args,
        )
      ).rows;
      if (!byParcel)
        sourceName =
          (
            await db().query(
              'SELECT name FROM landman.land_owner WHERE owner_key=$1',
              [key],
            )
          ).rows[0]?.name || sourceName;
      else sourceName = `Parcel ${key} · ownership research`;
      if (!sourceName) throw fail(404, 'Owner record not found');
    }
    return {
      project,
      profile,
      history,
      sourceName,
      parcels,
      total,
      truncated: total > 100,
    };
  }
  async function createProject(body, actor) {
    if (
      !actor ||
      !(
        await db().query(
          'SELECT 1 FROM landman.owner_project_member WHERE actor=$1 LIMIT 1',
          [actor],
        )
      ).rows.length
    )
      throw fail(403, 'Existing workspace membership required');
    const name = body?.name?.trim();
    if (typeof name !== 'string' || !name || name.length > 120)
      throw fail(400, 'Invalid project name');
    const c = await db().connect();
    try {
      await c.query('BEGIN');
      const project = (
        await c.query(
          'INSERT INTO landman.owner_project(name,created_by) VALUES($1,$2) RETURNING id,name',
          [name, actor],
        )
      ).rows[0];
      await c.query(
        'INSERT INTO landman.owner_project_member(project_id,actor) VALUES($1,$2)',
        [project.id, actor],
      );
      await c.query('COMMIT');
      return { project };
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  async function save(body, actor) {
    const b = validateOwnerRecord(body);
    await access(b.project, actor);
    if (b.subject.startsWith('owner:')) {
      if (
        !(
          await db().query(
            'SELECT 1 FROM landman.land_owner WHERE owner_key=$1',
            [b.subject.slice(6)],
          )
        ).rows.length
      )
        throw fail(400, 'Invalid owner');
    } else if (b.subject.startsWith('parcel:')) {
      if (
        !(
          await db().query('SELECT 1 FROM landman.land_parcel WHERE id=$1', [
            b.subject.slice(7),
          ])
        ).rows.length
      )
        throw fail(400, 'Invalid parcel');
    }
    const c = await db().connect();
    try {
      await c.query('BEGIN');
      const previous = (
        await c.query(
          'SELECT data FROM landman.owner_profile WHERE project_id=$1 AND subject=$2 FOR UPDATE',
          [b.project, b.subject],
        )
      ).rows[0];
      const assessment = Object.fromEntries(
        ['willingness', 'confidence', 'scope', 'basis', 'assessedOn'].map(
          (k) => [k, b.data[k]],
        ),
      );
      b.data.assessments = {
        ...(previous?.data?.assessments || {}),
        [b.data.transaction]: {
          ...assessment,
          actor,
          recordedAt: new Date().toISOString(),
        },
      };
      let result;
      if (b.revision === 0)
        result = await c.query(
          'INSERT INTO landman.owner_profile(project_id,subject,name,data,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING *',
          [b.project, b.subject, b.data.name, b.data, actor],
        );
      else
        result = await c.query(
          'UPDATE landman.owner_profile SET name=$3,data=$4,updated_by=$5,updated_at=now(),revision=revision+1 WHERE project_id=$1 AND subject=$2 AND revision=$6 RETURNING *',
          [b.project, b.subject, b.data.name, b.data, actor, b.revision],
        );
      if (!result.rows.length)
        throw fail(
          409,
          'Someone else updated this profile. Reload the saved record before editing again.',
        );
      const p = result.rows[0];
      await c.query(
        'INSERT INTO landman.owner_profile_history(profile_id,revision,data,actor) VALUES($1,$2,$3,$4)',
        [p.id, p.revision, p.data, actor],
      );
      await c.query('COMMIT');
      return { profile: p };
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  return { get, save, createProject };
}
