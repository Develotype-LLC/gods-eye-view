import { parseInspection } from './inspection.js';
import { ownerWorkspace, publicOwnerSummary } from './ownerWorkspace.js';
import pg from 'pg';
import { analyzeCorridors } from './pipeline.js';
import { fetchInfrastructure } from './longhaulInfrastructure.js';
import { parseTexasBox } from './texas.js';
export const LAND_ROLES = [
  'upstream',
  'midstream',
  'holdco',
  'minerals',
  'data-centers',
  'power',
  'agriculture',
  'public',
  'other',
  'unclassified',
];
export function parseLandFilters(q) {
  const basin = q.get('basin') || 'both',
    role = q.get('role') || '',
    client = q.get('client') || '',
    interest = q.get('interest') || 'appraisal';
  let owners;
  try {
    owners = JSON.parse(q.get('owners') || '[]');
  } catch {
    throw Error('Invalid owners');
  }
  if (
    !['both', 'permian', 'palo-duro'].includes(basin) ||
    (role && !LAND_ROLES.includes(role)) ||
    (client && !/^\d{1,12}$/.test(client)) ||
    ![
      'appraisal',
      'surface',
      'mineral',
      'leasehold',
      'easement',
      'option',
    ].includes(interest) ||
    !Array.isArray(owners) ||
    owners.length > 50 ||
    owners.some(
      (x) =>
        typeof x !== 'string' || x.length > 300 || x === 'OWNER NOT SUPPLIED',
    )
  )
    throw Error('Invalid land filters');
  return [
    basin,
    role,
    client,
    owners,
    q.get('candidates') === 'true',
    interest,
  ];
}
const ROLES = `CASE WHEN o.reviewed_at IS NOT NULL THEN o.reviewed_roles WHEN $5 THEN o.candidate_roles ELSE '{}'::text[] END`;
const FILTER = `p.snapshot_id=c.snapshot_id AND cardinality(p.basins)>0 AND ($1='both' OR $1=ANY(p.basins))
 AND ($6='appraisal' OR EXISTS(SELECT 1 FROM landman.land_interest i WHERE i.parcel_id=p.id AND i.kind=$6))
 AND ((cardinality($4::text[])=0 AND $3='' AND ($2='' OR $2='unclassified') AND NOT EXISTS(SELECT 1 FROM landman.land_account a WHERE a.parcel_id=p.id)) OR EXISTS(SELECT 1 FROM landman.land_account a JOIN landman.land_owner o ON o.owner_key=a.owner_key WHERE a.parcel_id=p.id
 AND (cardinality($4::text[])=0 OR a.owner_key=ANY($4::text[]))
 AND ($3='' OR EXISTS(SELECT 1 FROM landman.land_client_owner co WHERE co.owner_key=a.owner_key AND co.client_id=NULLIF($3,'')::bigint))
 AND ($2='' OR ($2='unclassified' AND cardinality(${ROLES})=0) OR $2=ANY(${ROLES}))))`;
const FROM =
  'FROM landman.land_parcel p JOIN landman.land_county c ON c.snapshot_id=p.snapshot_id';
export function landProxy({ pool: providedPool } = {}) {
  let pool = providedPool;
  function db() {
    if (!pool) {
      pool = new pg.Pool({
        host: '/var/run/postgresql',
        database: 'landman',
        user: 'godseye',
        max: 3,
        connectionTimeoutMillis: 3000,
        statement_timeout: 20000,
      });
      pool.on('error', () => {});
    }
    return pool;
  }
  const query = (s, a = []) => db().query(s, a);
  const workspace = ownerWorkspace(db);
  async function metadata() {
    return {
      counties: (
        await query(
          `SELECT c.fips,c.name,s.metadata,s.imported_at FROM landman.land_county c JOIN landman.land_snapshot s ON s.id=c.snapshot_id ORDER BY c.name`,
        )
      ).rows,
      clients: (
        await query(
          'SELECT c.id,c.name,count(o.owner_key)::int AS owners FROM landman.land_client c LEFT JOIN landman.land_client_owner o ON o.client_id=c.id GROUP BY c.id ORDER BY c.name',
        )
      ).rows,
      roles: LAND_ROLES,
      note: 'Appraisal-reported ownership. Mineral title, leasehold and other rights require recorded instruments; no such rights have been imported yet.',
    };
  }
  async function owners(q) {
    const term = (q.get('q') || '').trim();
    if (term.length < 2 || term.length > 100)
      throw Error('Invalid owner search (2–100 characters)');
    return {
      owners: (
        await query(
          `SELECT o.owner_key,o.name,o.candidate_roles,o.reviewed_roles,o.reviewed_at,o.candidates,count(DISTINCT a.parcel_id)::int AS parcels FROM landman.land_owner o JOIN landman.land_account a ON a.owner_key=o.owner_key JOIN landman.land_parcel p ON p.id=a.parcel_id JOIN landman.land_county c ON c.snapshot_id=p.snapshot_id WHERE o.name ILIKE $1 ESCAPE '\\' AND cardinality(p.basins)>0 GROUP BY o.owner_key ORDER BY count(DISTINCT a.parcel_id) DESC,o.name LIMIT 50`,
          ['%' + term.replace(/[\\%_]/g, '\\$&') + '%'],
        )
      ).rows,
    };
  }
  async function viewport(q) {
    const args = parseLandFilters(q),
      b = parseTexasBox(q.get('bbox'));
    const scoped = FILTER + ' AND p.geom && ST_MakeEnvelope($7,$8,$9,$10,4326)';
    const summary = (
      await query(
        `SELECT count(*)::int AS total,coalesce(sum(p.area_acres),0) AS acres, json_build_array(ST_XMin(ST_Extent(p.geom)),ST_YMin(ST_Extent(p.geom)),ST_XMax(ST_Extent(p.geom)),ST_YMax(ST_Extent(p.geom))) AS bounds ${FROM} WHERE ${FILTER}`,
        args,
      )
    ).rows[0];
    const all = [...args, ...b];
    const count = Number(
      (await query(`SELECT count(*)::int AS n ${FROM} WHERE ${scoped}`, all))
        .rows[0].n,
    );
    if (count > 600) {
      const rows = (
        await query(
          `SELECT count(*)::int AS count,avg(ST_X(ST_PointOnSurface(p.geom))) AS longitude,avg(ST_Y(ST_PointOnSurface(p.geom))) AS latitude,ST_XMin(ST_Extent(p.geom)) AS west,ST_YMin(ST_Extent(p.geom)) AS south,ST_XMax(ST_Extent(p.geom)) AS east,ST_YMax(ST_Extent(p.geom)) AS north ${FROM} WHERE ${scoped} GROUP BY floor(ST_X(ST_PointOnSurface(p.geom))/$11),floor(ST_Y(ST_PointOnSurface(p.geom))/$12)`,
          [
            ...all,
            Math.max((b[2] - b[0]) / 20, 0.001),
            Math.max((b[3] - b[1]) / 15, 0.001),
          ],
        )
      ).rows;
      return { mode: 'clusters', count, summary, features: rows };
    }
    const rows = (
      await query(
        `SELECT p.id,p.area_acres,c.name AS county,p.basins,ST_AsGeoJSON(p.geom,6)::json AS geometry,(SELECT string_agg(DISTINCT a.raw_owner,' / ') FROM landman.land_account a WHERE a.parcel_id=p.id) AS owner,
        coalesce((SELECT json_agg(json_build_object('key',a.owner_key,'name',a.raw_owner,'roles',${ROLES},'reviewed',o.reviewed_at IS NOT NULL)) FROM landman.land_account a JOIN landman.land_owner o ON o.owner_key=a.owner_key WHERE a.parcel_id=p.id),'[]'::json) AS ownership
        ${FROM} WHERE ${scoped} ORDER BY p.id LIMIT 600`,
        all,
      )
    ).rows;
    return { mode: 'parcels', count, summary, features: rows };
  }
  async function detail(q) {
    const id = q.get('id');
    if (!/^\d{1,14}$/.test(id || '')) throw Error('Invalid parcel');
    const parcel = (
      await query(
        `SELECT p.id,p.source_key,p.area_acres,p.basins,c.name AS county,s.metadata AS source,json_build_array(ST_XMin(p.geom),ST_YMin(p.geom),ST_XMax(p.geom),ST_YMax(p.geom)) AS bounds ${FROM} JOIN landman.land_snapshot s ON s.id=p.snapshot_id WHERE p.id=$1`,
        [id],
      )
    ).rows[0];
    if (!parcel) return { parcel: null };
    return {
      parcel,
      accounts: (
        await query(
          'SELECT a.raw_owner,a.owner_key,a.properties,o.candidate_roles,o.candidates,o.reviewed_roles,o.review_note,o.reviewed_at FROM landman.land_account a JOIN landman.land_owner o ON o.owner_key=a.owner_key WHERE a.parcel_id=$1 ORDER BY a.source_key',
          [id],
        )
      ).rows,
      interests: (
        await query('SELECT * FROM landman.land_interest WHERE parcel_id=$1', [
          id,
        ])
      ).rows,
    };
  }
  async function inspectPoint(q) {
    const [longitude, latitude] = parseInspection(q);
    const rows = (
      await query(
        `SELECT p.id,p.source_key,p.area_acres,c.name AS county,s.metadata AS source,
      (SELECT string_agg(DISTINCT a.raw_owner,' / ') FROM landman.land_account a WHERE a.parcel_id=p.id) AS owner
      ${FROM} JOIN landman.land_snapshot s ON s.id=p.snapshot_id
      WHERE cardinality(p.basins)>0 AND ST_Covers(p.geom,ST_SetSRID(ST_MakePoint($1,$2),4326)) ORDER BY p.id LIMIT 21`,
        [longitude, latitude],
      )
    ).rows;
    return {
      parcels: rows.slice(0, 20),
      truncated: rows.length > 20,
      note: 'Containing appraisal polygons from imported counties. No match does not mean unowned land; mineral rights need recorded evidence.',
    };
  }
  async function write(path, body, actor) {
    if (path === '/public-owner-query')
      return publicOwnerSummary(query, new URLSearchParams(body));
    if (path === '/owner-projects') return workspace.createProject(body, actor);
    if (path === '/owner-profile-query')
      return workspace.get('/owner-profile', new URLSearchParams(body), actor);
    if (path === '/owner-profile') return workspace.save(body, actor);
    if (path === '/route-corridors') return analyzeCorridors(query, body);
    if (path === '/clients') {
      const name = body.name?.trim(),
        owners = body.owners;
      if (
        !name ||
        name.length > 100 ||
        !Array.isArray(owners) ||
        !owners.length ||
        owners.length > 50 ||
        owners.some(
          (x) =>
            typeof x !== 'string' ||
            x.length > 300 ||
            x === 'OWNER NOT SUPPLIED',
        )
      )
        throw Error('Invalid client portfolio');
      const client = await db().connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'INSERT INTO landman.land_client(name,created_by) VALUES($1,$2) ON CONFLICT(name) DO NOTHING',
          [name, actor],
        );
        const id = (
          await client.query(
            'SELECT id FROM landman.land_client WHERE name=$1',
            [name],
          )
        ).rows[0].id;
        const valid = (
          await client.query(
            'SELECT owner_key FROM landman.land_owner WHERE owner_key=ANY($1::text[])',
            [owners],
          )
        ).rows;
        if (valid.length !== new Set(owners).size)
          throw Error('Invalid owner membership');
        await client.query(
          'INSERT INTO landman.land_client_owner SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING',
          [id, owners],
        );
        await client.query('COMMIT');
        return { id, name };
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
    if (path === '/classify') {
      const { owner, roles, note } = body;
      if (
        typeof owner !== 'string' ||
        owner.length > 300 ||
        owner === 'OWNER NOT SUPPLIED' ||
        !Array.isArray(roles) ||
        roles.length > 10 ||
        roles.some((r) => !LAND_ROLES.includes(r) || r === 'unclassified') ||
        typeof note !== 'string' ||
        note.trim().length < 5 ||
        note.length > 1000
      )
        throw Error('Invalid owner classification; include an evidence note');
      const result = await query(
        'UPDATE landman.land_owner SET reviewed_roles=$2::text[],review_note=$3,reviewed_by=$4,reviewed_at=now() WHERE owner_key=$1 RETURNING owner_key',
        [owner, roles, note, actor],
      );
      if (!result.rows.length) throw Error('Invalid owner');
      return { saved: true };
    }
    throw Error('Invalid write endpoint');
  }
  function install(server) {
    server.middlewares.use('/api/reference/land', async (req, res) => {
      const reply = (code, data) => {
        res.statusCode = code;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(data));
      };
      try {
        const u = new URL(req.url, 'http://local');
        if (req.method === 'GET') {
          if (
            ['/owner-projects', '/owner-directory', '/owner-profile'].includes(
              u.pathname,
            )
          )
            return reply(
              200,
              await workspace.get(
                u.pathname,
                u.searchParams,
                String(req.headers['x-landman-user'] || ''),
              ),
            );
          if (u.pathname === '/infrastructure')
            return reply(
              200,
              await fetchInfrastructure(u.searchParams.get('bbox')),
            );
          if (u.pathname === '/inspect')
            return reply(200, await inspectPoint(u.searchParams));
          if (u.pathname === '/catalog') return reply(200, await metadata());
          if (u.pathname === '/owners')
            return reply(200, await owners(u.searchParams));
          if (u.pathname === '/viewport')
            return reply(200, await viewport(u.searchParams));
          if (u.pathname === '/detail')
            return reply(200, await detail(u.searchParams));
          return reply(404, { error: 'Unknown land endpoint' });
        }
        if (req.method !== 'POST')
          return reply(405, { error: 'Method not allowed' });
        if (
          req.headers['x-landman-write'] !== '1' ||
          !String(req.headers['content-type']).startsWith('application/json')
        )
          return reply(403, {
            error: 'Same-origin application write required',
          });
        const origin = new URL(req.headers.origin || 'http://invalid');
        if (
          ![
            'landman.develotype.com',
            'godseye.develotype.com',
            '127.0.0.1',
            'localhost',
          ].includes(origin.hostname)
        )
          return reply(403, { error: 'Untrusted origin' });
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (
            Buffer.byteLength(raw) >
            (u.pathname === '/route-corridors'
              ? 300000
              : ['/owner-profile-query', '/public-owner-query'].includes(
                    u.pathname,
                  )
                ? 64000
                : 16000)
          )
            return reply(413, { error: 'Request too large' });
        }
        let body;
        try {
          body = JSON.parse(raw);
        } catch {
          throw Error('Invalid JSON');
        }
        const actor = String(req.headers['x-landman-user'] || '').slice(0, 100);
        return reply(200, await write(u.pathname, body, actor));
      } catch (e) {
        const invalid = e.message.startsWith('Invalid');
        reply(e.status || (invalid ? 400 : 503), {
          error:
            invalid || e.status
              ? e.message
              : 'Land database unavailable; retry shortly.',
        });
      }
    });
  }
  return {
    name: 'landman-land',
    configureServer: install,
    configurePreviewServer: install,
  };
}
