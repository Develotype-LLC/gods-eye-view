import {
  parseInspection,
  inspectionWhere,
  INSPECTION_POINT,
} from './inspection.js';
import pg from 'pg';
import { parseTexasBox } from './texas.js';
const KINDS = new Set([
  'operator',
  'plug_action',
  'iwar_record',
  'iwar_well',
  'iwar_well_operator',
  'iwar_well_denial_code',
  'permian_current_well_status',
  'permian_operator_county_year',
  'w10_test',
  'g10_test',
  'annual_legal_operator_ranking',
  'ewa_exxon_family_candidate',
  'ewa_operator_snapshot',
  'well_location',
]);
export function referenceRecordsProxy({ pool: providedPool } = {}) {
  let pool = providedPool;
  const db = () => {
    if (!pool) {
      pool = new pg.Pool({
        host: '/var/run/postgresql',
        database: 'landman',
        user: 'godseye',
        max: 3,
        connectionTimeoutMillis: 3000,
        idleTimeoutMillis: 30000,
        statement_timeout: 12000,
      });
      pool.on('error', () => {});
    }
    return pool;
  };
  const query = (sql, args = []) => db().query(sql, args);
  async function dataset(id) {
    if (!/^[a-z0-9-]{1,40}$/.test(id || '')) throw new Error('Invalid dataset');
    const d = (
      await query('SELECT * FROM landman.reference_dataset WHERE id=$1', [id])
    ).rows[0];
    if (!d) throw new Error('Invalid dataset');
    return d;
  }
  async function catalog() {
    return {
      datasets: (
        await query(`SELECT d.*,r.imported_at,
   (SELECT array_agg(period ORDER BY period) FROM (SELECT DISTINCT period FROM landman.reference_observation o WHERE o.run_id=d.run_id AND o.dataset=d.id UNION SELECT DISTINCT to_char(observed_date,'YYYY') FROM landman.reference_feature f WHERE f.run_id=d.run_id AND f.dataset=d.id AND observed_date IS NOT NULL) p) AS periods,
   (SELECT json_build_array(ST_XMin(ST_Extent(geom)),ST_YMin(ST_Extent(geom)),ST_XMax(ST_Extent(geom)),ST_YMax(ST_Extent(geom))) FROM landman.reference_feature f WHERE f.run_id=d.run_id AND f.dataset=d.id) AS bounds
   FROM landman.reference_dataset d JOIN landman.reference_run r ON r.id=d.run_id ORDER BY d.name`)
      ).rows,
    };
  }
  async function injectionHeat(d, b, params) {
    const metric = params.get('view'),
      year = params.get('period') || '';
    if (!['capacity', 'volume'].includes(metric))
      throw new Error('Invalid injection display');
    if (metric === 'volume' && !/^\d{4}$/.test(year))
      throw new Error('Invalid injection year');
    const numeric = (expression) =>
      `CASE WHEN ${expression} ~ '^[0-9]+([.][0-9]+)?$' THEN (${expression})::double precision END`;
    const capacity = numeric("f.properties->>'TotalBPDMax'");
    const volume = numeric("o.raw->>'reported_volume_bbl'");
    const rows = (
      await query(
        `WITH points AS (
   SELECT f.key,ST_Transform(ST_PointOnSurface(f.geom),5070) AS p,
    CASE WHEN $3='capacity' THEN NULLIF(${capacity},0) ELSE
     (SELECT sum(${volume}) FROM landman.reference_observation o WHERE o.run_id=f.run_id AND o.dataset=f.dataset AND o.feature_key=f.key AND o.period=$4 AND o.kind='Annual reported injection') END AS value
   FROM landman.reference_feature f WHERE f.run_id=$1 AND f.dataset=$2 AND f.geom IS NOT NULL
  ), cells AS (
   SELECT floor(ST_X(p)/5000)::int AS x,floor(ST_Y(p)/5000)::int AS y,
    count(*)::int AS count,count(value)::int AS known,sum(value) AS value
   FROM points GROUP BY 1,2
  ), shapes AS (
   SELECT *,ST_Transform(ST_MakeEnvelope(x*5000,y*5000,(x+1)*5000,(y+1)*5000,5070),4326) AS geom FROM cells
  ) SELECT x||':'||y AS key,count,known,count-known AS missing,value,
   ST_AsGeoJSON(geom)::json AS geometry,ST_X(ST_Centroid(geom)) AS longitude,ST_Y(ST_Centroid(geom)) AS latitude
   FROM shapes WHERE geom && ST_MakeEnvelope($5,$6,$7,$8,4326) ORDER BY x,y`,
        [d.run_id, d.id, metric, year, ...b],
      )
    ).rows;
    return {
      mode: 'injection-heat',
      metric,
      period: metric === 'volume' ? year : '',
      cellKm: 5,
      units: metric === 'capacity' ? 'bbl/day' : 'bbl/year',
      count: rows.reduce((n, r) => n + r.count, 0),
      features: rows,
    };
  }
  async function viewport(params) {
    const d = await dataset(params.get('dataset')),
      b = parseTexasBox(params.get('bbox'));
    if (
      d.id === 'texnet-injection' &&
      params.get('view') &&
      params.get('view') !== 'points'
    )
      return injectionHeat(d, b, params);
    const period = params.get('period') || '',
      kind = params.get('kind') || 'ET';
    if (period && !/^\d{4}(-\d{2})?$/.test(period))
      throw new Error('Invalid period');
    if (!['ET', 'ETo'].includes(kind)) throw new Error('Invalid measurement');
    const args = [d.run_id, d.id, ...b, period, kind];
    const where = `f.run_id=$1 AND f.dataset=$2 AND f.geom && ST_MakeEnvelope($3,$4,$5,$6,4326)
    AND ($7='' OR (f.observed_date IS NOT NULL AND left(f.observed_date::text,length($7))=$7) OR EXISTS (SELECT 1 FROM landman.reference_observation o WHERE o.run_id=f.run_id AND o.dataset=f.dataset AND o.feature_key=f.key AND o.period=$7 AND ($2<>'openet' OR o.kind=$8)))`;
    const count = Number(
      (
        await query(
          `SELECT count(*)::int AS n FROM landman.reference_feature f WHERE ${where}`,
          args,
        )
      ).rows[0].n,
    );
    if (count > 1000) {
      const sx = Math.max((b[2] - b[0]) / 28, 0.001),
        sy = Math.max((b[3] - b[1]) / 20, 0.001);
      const rows = (
        await query(
          `SELECT count(*)::int AS count,avg(ST_X(ST_PointOnSurface(f.geom))) AS longitude,avg(ST_Y(ST_PointOnSurface(f.geom))) AS latitude,
     min(ST_X(ST_PointOnSurface(f.geom))) AS west,min(ST_Y(ST_PointOnSurface(f.geom))) AS south,max(ST_X(ST_PointOnSurface(f.geom))) AS east,max(ST_Y(ST_PointOnSurface(f.geom))) AS north
     FROM landman.reference_feature f WHERE ${where} GROUP BY floor(ST_X(ST_PointOnSurface(f.geom))/$9),floor(ST_Y(ST_PointOnSurface(f.geom))/$10)`,
          [...args, sx, sy],
        )
      ).rows;
      return { mode: 'clusters', count, features: rows };
    }
    const rows = (
      await query(
        `SELECT f.key,f.name,f.api8,f.observed_date,ST_X(ST_PointOnSurface(f.geom)) AS longitude,ST_Y(ST_PointOnSurface(f.geom)) AS latitude,
    ST_AsGeoJSON(f.geom)::json AS geometry,
    (SELECT avg(o.value) FROM landman.reference_observation o WHERE o.run_id=f.run_id AND o.dataset=f.dataset AND o.feature_key=f.key AND o.period=$7 AND o.kind=$8) AS value
    FROM landman.reference_feature f WHERE ${where} ORDER BY f.key LIMIT 1000`,
        args,
      )
    ).rows;
    return { mode: 'features', count, features: rows };
  }
  async function inspect(params) {
    const point = parseInspection(params),
      period = params.get('period') || '',
      kind = params.get('kind') || 'ET';
    if (period && !/^\d{4}(-\d{2})?$/.test(period))
      throw new Error('Invalid period');
    if (!['ET', 'ETo'].includes(kind)) throw new Error('Invalid measurement');
    const d = await dataset(params.get('dataset'));
    const args = [...point, d.run_id, d.id, period, kind];
    const where = `f.run_id=$4 AND f.dataset=$5 AND ${inspectionWhere('f.geom')} AND ($6='' OR left(f.observed_date::text,length($6))=$6 OR EXISTS(SELECT 1 FROM landman.reference_observation o WHERE o.run_id=f.run_id AND o.dataset=f.dataset AND o.feature_key=f.key AND o.period=$6 AND ($5<>'openet' OR o.kind=$7)))`;
    const total = Number(
      (
        await query(
          `SELECT count(*)::int AS n FROM landman.reference_feature f WHERE ${where}`,
          args,
        )
      ).rows[0].n,
    );
    const features = (
      await query(
        `SELECT f.key,f.name,f.api8,f.properties,f.observed_date,
   ST_Distance(f.geom::geography,${INSPECTION_POINT}::geography) AS distance_m,
   ST_Covers(f.geom,${INSPECTION_POINT}) AS contains_point,
   (SELECT avg(o.value) FROM landman.reference_observation o WHERE o.run_id=f.run_id AND o.dataset=f.dataset AND o.feature_key=f.key AND o.period=$6 AND o.kind=$7) AS value
   FROM landman.reference_feature f WHERE ${where} ORDER BY distance_m,f.key LIMIT 5`,
        args,
      )
    ).rows;
    return {
      dataset: d.id,
      name: d.name,
      source: d.source,
      note: d.note,
      total,
      features,
      period,
      kind,
      radius: point[2],
    };
  }
  function offset(params) {
    const v = params.get('offset') || '0';
    if (!/^\d{1,7}$/.test(v) || Number(v) > 1000000)
      throw new Error('Invalid offset');
    return Number(v);
  }
  async function detail(params) {
    const d = await dataset(params.get('dataset')),
      key = params.get('key') || '';
    if (!key || key.length > 160) throw new Error('Invalid record key');
    const off = offset(params);
    const f = (
      await query(
        'SELECT key,name,api8,properties FROM landman.reference_feature WHERE run_id=$1 AND dataset=$2 AND key=$3',
        [d.run_id, d.id, key],
      )
    ).rows[0];
    if (!f) return { feature: null, observations: [], total: 0 };
    let rows, total;
    if (d.metadata.rrc_kind) {
      const args = [d.run_id, d.metadata.rrc_kind, f.api8];
      total = Number(
        (
          await query(
            'SELECT count(*)::int AS n FROM landman.rrc_record WHERE run_id=$1 AND kind=$2 AND api8=$3',
            args,
          )
        ).rows[0].n,
      );
      rows = (
        await query(
          'SELECT kind,raw FROM landman.rrc_record WHERE run_id=$1 AND kind=$2 AND api8=$3 ORDER BY record_id LIMIT 100 OFFSET $4',
          [...args, off],
        )
      ).rows;
    } else {
      const args = [d.run_id, d.id, key];
      total = Number(
        (
          await query(
            'SELECT count(*)::int AS n FROM landman.reference_observation WHERE run_id=$1 AND dataset=$2 AND feature_key=$3',
            args,
          )
        ).rows[0].n,
      );
      rows = (
        await query(
          'SELECT period,kind,value,raw FROM landman.reference_observation WHERE run_id=$1 AND dataset=$2 AND feature_key=$3 ORDER BY period DESC,kind,id LIMIT 100 OFFSET $4',
          [...args, off],
        )
      ).rows;
    }
    return { feature: f, observations: rows, total, offset: off, note: d.note };
  }
  async function records(params) {
    const kind = params.get('kind') || '',
      api = params.get('api') || '',
      key = params.get('key') || '',
      off = offset(params);
    if (kind && !KINDS.has(kind)) throw new Error('Invalid record type');
    if (api && !/^\d{8}$/.test(api)) throw new Error('Invalid API-8');
    if (key && !/^[0-9A-Za-z -]{1,40}$/.test(key))
      throw new Error('Invalid lease, well or operator key');
    const d = await dataset('rrc-records');
    const args = [d.run_id, kind, api, key];
    const where = `run_id=$1 AND ($2='' OR kind=$2) AND ($3='' OR api8=$3) AND ($4='' OR join_key=$4)`;
    const total = Number(
      (
        await query(
          `SELECT count(*)::int AS n FROM landman.rrc_record WHERE ${where}`,
          args,
        )
      ).rows[0].n,
    );
    const rows = (
      await query(
        `SELECT kind,api8,join_key,raw FROM landman.rrc_record WHERE ${where} ORDER BY kind,record_id LIMIT 50 OFFSET $5`,
        [...args, off],
      )
    ).rows;
    return { rows, total, offset: off, note: d.note };
  }
  function install(server) {
    server.middlewares.use('/api/reference/records', async (req, res) => {
      const reply = (code, data) => {
        res.statusCode = code;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(data));
      };
      if (req.method !== 'GET')
        return reply(405, { error: 'Method not allowed' });
      try {
        const u = new URL(req.url, 'http://local');
        if (u.pathname === '/catalog') return reply(200, await catalog());
        if (u.pathname === '/viewport')
          return reply(200, await viewport(u.searchParams));
        if (u.pathname === '/inspect')
          return reply(200, await inspect(u.searchParams));
        if (u.pathname === '/detail')
          return reply(200, await detail(u.searchParams));
        if (u.pathname === '/rrc')
          return reply(200, await records(u.searchParams));
        return reply(404, { error: 'Unknown reference endpoint' });
      } catch (e) {
        const input = e.message.startsWith('Invalid');
        return reply(input ? 400 : 503, {
          error: input
            ? e.message
            : 'Reference database unavailable; retry shortly.',
        });
      }
    });
  }
  return {
    name: 'landman-reference-records',
    configureServer: install,
    configurePreviewServer: install,
  };
}
