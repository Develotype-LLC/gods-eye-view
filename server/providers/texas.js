import { densityOptions, densityCache } from './wellDensity.js';
import {
  parseInspection,
  inspectionWhere,
  INSPECTION_POINT,
} from './inspection.js';
import pg from 'pg';
import { readResponseJsonCapped } from './common/http.js';
export function parseTexasBox(value) {
  const b = String(value || '')
    .split(',')
    .map(Number);
  if (
    b.length !== 4 ||
    !b.every(Number.isFinite) ||
    b[0] >= b[2] ||
    b[1] >= b[3] ||
    b[0] < -180 ||
    b[2] > 180 ||
    b[1] < -90 ||
    b[3] > 90
  )
    throw new Error('Invalid map bounds');
  return b;
}
export function texasProxy({
  pool: providedPool,
  fetchImpl = (...args) => fetch(...args),
} = {}) {
  let pool = providedPool;
  const pending = new Map();
  const db = () => {
    if (!pool) {
      pool = new pg.Pool({
        host: '/var/run/postgresql',
        database: 'landman',
        user: 'godseye',
        max: 4,
        connectionTimeoutMillis: 3000,
        idleTimeoutMillis: 30000,
        statement_timeout: 20000,
      });
      pool.on('error', () => {});
    }
    return pool;
  };
  const cachedDensity = densityCache((sql, args) => db().query(sql, args));
  async function status() {
    const { rows } = await db().query(
      `SELECT d.name,r.row_count,r.completed_at,r.metadata FROM landman.dataset d JOIN landman.ingest_run r ON r.id=d.run_id ORDER BY d.name`,
    );
    const categories = (
      await db().query(
        `SELECT category,count(*)::int AS count FROM landman.well_location WHERE run_id=(SELECT run_id FROM landman.dataset WHERE name='gis') GROUP BY category ORDER BY category`,
      )
    ).rows;
    return {
      datasets: rows,
      categories,
      source: 'Texas RRC public GIS and UIC master',
      scope:
        'Statewide source inventories; GIS symbols are source classifications, not verified current operating status.',
    };
  }
  async function viewport(params) {
    const bounds = parseTexasBox(params.get('bbox'));
    const { view, cellKm } = densityOptions(params);
    const category = params.get('category') || '';
    if (category.length > 80) throw new Error('Invalid category');
    const where = `run_id=(SELECT run_id FROM landman.dataset WHERE name='gis') AND geom && ST_MakeEnvelope($1,$2,$3,$4,4326) AND ($5='' OR category=$5)`;
    const args = [...bounds, category];
    const count = Number(
      (
        await db().query(
          `SELECT count(*)::int AS count FROM landman.well_location WHERE ${where}`,
          args,
        )
      ).rows[0].count,
    );
    if (view === 'density' || (view === 'auto' && count > 1500)) {
      const features = await cachedDensity(
        bounds,
        category,
        cellKm,
      );
      return {
        mode: 'density',
        count,
        features,
        cellKm,
        areaKm2: cellKm * cellKm,
        unit: 'well locations/km²',
        projection: 'EPSG:5070',
        note: 'Full fixed cells; edge cells extend beyond view. Counts are RRC inventory locations, not active production. Empty cells have no matching imported locations.',
      };
    }
    if (count <= 1500) {
      const rows = (
        await db().query(
          `SELECT objectid::text AS id,api8,well_number,category,ST_X(geom) AS longitude,ST_Y(geom) AS latitude FROM landman.well_location WHERE ${where} ORDER BY objectid LIMIT 1500`,
          args,
        )
      ).rows;
      return { mode: 'points', count, features: rows };
    }
    const sx = Math.max((bounds[2] - bounds[0]) / 32, 0.001),
      sy = Math.max((bounds[3] - bounds[1]) / 22, 0.001);
    const rows = (
      await db().query(
        `SELECT count(*)::int AS count,avg(ST_X(geom)) AS longitude,avg(ST_Y(geom)) AS latitude,min(ST_X(geom)) AS west,min(ST_Y(geom)) AS south,max(ST_X(geom)) AS east,max(ST_Y(geom)) AS north FROM landman.well_location WHERE ${where} GROUP BY floor(ST_X(geom)/$6),floor(ST_Y(geom)/$7)`,
        [...args, sx, sy],
      )
    ).rows;
    return { mode: 'clusters', count, features: rows };
  }
  async function inspect(params) {
    const point = parseInspection(params),
      category = params.get('category') || '';
    if (category.length > 80) throw new Error('Invalid category');
    const args = [...point, category],
      where = `run_id=(SELECT run_id FROM landman.dataset WHERE name='gis') AND ${inspectionWhere('geom')} AND ($4='' OR category=$4)`;
    const total = Number(
      (
        await db().query(
          `SELECT count(*)::int AS count FROM landman.well_location WHERE ${where}`,
          args,
        )
      ).rows[0].count,
    );
    const features = (
      await db().query(
        `SELECT objectid::text AS id,api8,well_number,category,ST_Distance(geom::geography,${INSPECTION_POINT}::geography) AS distance_m FROM landman.well_location WHERE ${where} ORDER BY distance_m,objectid LIMIT 5`,
        args,
      )
    ).rows;
    return {
      name: 'Texas wells',
      total,
      features,
      source: 'Texas RRC statewide GIS inventory',
      note: 'Source classifications include permitted and plugged locations; proximity does not establish ownership or operating status.',
      radius: point[2],
    };
  }
  async function well(params) {
    const id = params.get('id'),
      api = params.get('api');
    let query, args;
    if (id && /^\d{1,12}$/.test(id)) {
      query = 'objectid=$1';
      args = [id];
    } else if (api && /^(42)?\d{8}$/.test(api)) {
      query = 'api8=$1';
      args = [api.length === 10 ? api.slice(2) : api];
    } else throw new Error('Provide a GIS ID or Texas API-8/API-10');
    const rows = (
      await db().query(
        `SELECT objectid::text AS id,api8,well_number,category,ST_X(geom) AS longitude,ST_Y(geom) AS latitude,raw FROM landman.well_location WHERE run_id=(SELECT run_id FROM landman.dataset WHERE name='gis') AND ${query} ORDER BY objectid LIMIT 25`,
        args,
      )
    ).rows;
    if (!rows.length) return { matches: [], permits: [] };
    const permits = rows[0].api8
      ? (
          await db().query(
            `SELECT uic,injection_type,raw FROM landman.uic_permit WHERE run_id=(SELECT run_id FROM landman.dataset WHERE name='uic') AND api8=$1 ORDER BY uic`,
            [rows[0].api8],
          )
        ).rows
      : [];
    return { matches: rows, permits };
  }
  async function history(api) {
    if (!/^\d{8}$/.test(api)) throw new Error('Invalid API-8');
    const cache = (
      await db().query(
        'SELECT payload,fetched_at FROM landman.history_cache WHERE api8=$1',
        [api],
      )
    ).rows[0];
    if (
      cache &&
      Date.now() - new Date(cache.fetched_at).getTime() < 24 * 60 * 60_000
    )
      return { ...cache.payload, cache: 'cached' };
    if (pending.has(api)) return pending.get(api);
    if (pending.size >= 2)
      throw new Error('History requests are busy; try again');
    const job = (async () => {
      const permits = (
        await db().query(
          `SELECT uic FROM landman.uic_permit WHERE run_id=(SELECT run_id FROM landman.dataset WHERE name='uic') AND api8=$1 AND injection_type IN (1,2) ORDER BY uic`,
          [api],
        )
      ).rows;
      if (!permits.length)
        return {
          api8: api,
          rows: [],
          note: 'No disposal-type UIC permits in the imported master. This is not oil/gas production history.',
        };
      if (permits.length > 50 || permits.some((p) => !/^\d{9}$/.test(p.uic)))
        throw new Error('Permit count or identifier cannot be queried safely');
      const all = [];
      const signal = AbortSignal.timeout(25000);
      for (let offset = 0; offset < 20000; offset += 5000) {
        const url = new URL('https://data.texas.gov/resource/qq2j-f2zm.json');
        url.search = new URLSearchParams({
          $where: `uic_no in(${permits.map((p) => `'${p.uic}'`).join(',')}) AND formatted_date >= '2016-01-01' AND type_uic in(1,2)`,
          $order: 'uic_no,formatted_date,id',
          $limit: '5000',
          $offset: String(offset),
        });
        const response = await fetchImpl(url.toString(), {
          signal,
          redirect: 'error',
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error('RRC history unavailable');
        }
        const rows = await readResponseJsonCapped(response, 8 * 1024 * 1024);
        if (!Array.isArray(rows)) throw new Error('Invalid RRC history');
        all.push(...rows);
        if (rows.length < 5000) break;
        if (offset === 15000)
          throw new Error('History exceeds safe response size');
      }
      const payload = {
        api8: api,
        fetchedAt: new Date().toISOString(),
        rows: all,
        note: 'Raw H-10 monthly records by UIC, fetched on demand since 2016. Zero may be a source placeholder; missing values are not zero. Monthly measurements are filed annually.',
      };
      await db().query(
        'INSERT INTO landman.history_cache(api8,payload) VALUES($1,$2) ON CONFLICT(api8) DO UPDATE SET payload=excluded.payload,fetched_at=now()',
        [api, JSON.stringify(payload)],
      );
      return { ...payload, cache: 'refreshed' };
    })()
      .catch((error) => {
        if (cache)
          return {
            ...cache.payload,
            cache: 'stale',
            warning: 'RRC refresh failed; previous saved history shown.',
          };
        throw error;
      })
      .finally(() => pending.delete(api));
    pending.set(api, job);
    return job;
  }
  function install(server) {
    server.middlewares.use('/api/reference/texas', async (req, res) => {
      const reply = (code, data) => {
        res.statusCode = code;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(data));
      };
      if (req.method !== 'GET')
        return reply(405, { error: 'Method not allowed' });
      const url = new URL(req.url || '/', 'http://localhost');
      try {
        if (url.pathname === '/status') return reply(200, await status());
        if (url.pathname === '/viewport')
          return reply(200, await viewport(url.searchParams));
        if (url.pathname === '/inspect')
          return reply(200, await inspect(url.searchParams));
        if (url.pathname === '/well')
          return reply(200, await well(url.searchParams));
        if (url.pathname === '/history')
          return reply(200, await history(url.searchParams.get('api') || ''));
        return reply(404, { error: 'Unknown Texas data endpoint' });
      } catch (error) {
        const input = /Invalid|Provide/.test(error.message);
        return reply(input ? 400 : 503, {
          error: input
            ? error.message
            : 'Texas database or upstream history is unavailable; try again shortly.',
        });
      }
    });
  }
  return {
    name: 'landman-texas-database',
    configureServer: install,
    configurePreviewServer: install,
  };
}
