import {
  readResponseJsonCapped,
  readResponseBytesCapped,
} from './common/http.js';

const API = 'https://d2qmcvu7qty7vn.cloudfront.net';
export function normalizeHistory(raw) {
  const frames = new Map();
  for (const [id, row] of Object.entries(raw)) {
    const match = /^OPERA_L3_DISP-S1_IW_(F\d+)_VV_.*\.nc$/.exec(id);
    if (
      !match ||
      !row ||
      typeof row.secondary_datetime !== 'string' ||
      !Number.isFinite(Date.parse(row.secondary_datetime))
    )
      continue;
    const date = new Date(
      row.secondary_datetime.endsWith('Z')
        ? row.secondary_datetime
        : row.secondary_datetime + 'Z',
    ).toISOString();
    const value = row.short_wavelength_displacement;
    const point = {
      date,
      valueMm:
        typeof value === 'number' &&
        Number.isFinite(value) &&
        row.is_masked !== true
          ? value * 1000
          : null,
      masked: row.is_masked === true,
      qualityReported: typeof row.is_masked === 'boolean',
      source: id,
    };
    if (!frames.has(match[1])) frames.set(match[1], []);
    frames.get(match[1]).push(point);
  }
  return [...frames].map(([frame, points]) => ({
    frame,
    points: points.sort((a, b) => a.date.localeCompare(b.date)),
  }));
}
export function operaNationalProxy({
  fetchImpl = (...args) => fetch(...args),
  now = () => Date.now(),
} = {}) {
  const cache = new Map(),
    pending = new Map();
  const tiles = new Map(),
    tilePending = new Map();
  function install(server) {
    server.middlewares.use(
      '/api/reference/ground-motion/tiles',
      async (req, res) => {
        const match =
          /^\/(asc|desc)\/(\d{1,2})\/(\d{1,4})\/(\d{1,4})\.png$/.exec(
            req.url || '',
          );
        if (req.method !== 'GET' || !match) {
          res.statusCode = 400;
          res.end();
          return;
        }
        const [, direction, z, x, y] = match;
        if (+z > 12 || +x >= 2 ** +z || +y >= 2 ** +z) {
          res.statusCode = 400;
          res.end();
          return;
        }
        const key = match[0];
        try {
          let data = tiles.get(key);
          if (!data || now() - data.time > 3600000) {
            if (!tilePending.has(key)) {
              if (tilePending.size >= 32) {
                res.statusCode = 429;
                res.end();
                return;
              }
              tilePending.set(
                key,
                (async () => {
                  const r = await fetchImpl(
                    'https://d3g9emy65n853h.cloudfront.net/main/' +
                      direction +
                      '/vel/' +
                      z +
                      '/' +
                      x +
                      '/' +
                      y +
                      '.png',
                    { redirect: 'error', signal: AbortSignal.timeout(20000) },
                  );
                  let bytes;
                  if (r.status === 404) {
                    await r.body?.cancel();
                    bytes = Buffer.from(
                      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
                      'base64',
                    );
                  } else {
                    if (!r.ok) {
                      await r.body?.cancel();
                      throw Error('Tile unavailable');
                    }
                    bytes = Buffer.from(
                      await readResponseBytesCapped(r, 512 * 1024),
                    );
                    if (
                      bytes.subarray(0, 8).toString('hex') !==
                      '89504e470d0a1a0a'
                    )
                      throw Error('Invalid tile');
                  }
                  const entry = { bytes, time: now() };
                  if (tiles.size >= 256)
                    tiles.delete(tiles.keys().next().value);
                  tiles.set(key, entry);
                  return entry;
                })().finally(() => tilePending.delete(key)),
              );
            }
            data = await tilePending.get(key);
          }
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'private, max-age=3600');
          res.end(data.bytes);
        } catch {
          res.statusCode = 502;
          res.end();
        }
      },
    );
    server.middlewares.use(
      '/api/reference/ground-motion/history',
      async (req, res) => {
        const reply = (code, body) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'GET')
          return reply(405, { error: 'Method not allowed' });
        const q = new URL(req.url || '/', 'http://localhost').searchParams;
        const lon = Number(q.get('longitude')),
          lat = Number(q.get('latitude')),
          direction = q.get('direction') || 'ascending';
        if (
          [...q.keys()].some(
            (k) => !['longitude', 'latitude', 'direction'].includes(k),
          ) ||
          !q.get('longitude')?.trim() ||
          !q.get('latitude')?.trim() ||
          !Number.isFinite(lon) ||
          !Number.isFinite(lat) ||
          lon < -180 ||
          lon > 180 ||
          lat < -85 ||
          lat > 85 ||
          !['ascending', 'descending'].includes(direction)
        )
          return reply(400, {
            error: 'Valid longitude, latitude and orbit direction are required',
          });
        const key = `${lon.toFixed(5)},${lat.toFixed(5)},${direction}`;
        if (cache.has(key) && now() - cache.get(key).time < 3600000)
          return reply(200, cache.get(key).body);
        if (!pending.has(key)) {
          if (pending.size >= 4)
            return reply(429, {
              error: 'Ground-movement service is busy; try again shortly',
            });
          pending.set(
            key,
            (async () => {
              const response = await fetchImpl(API + '/timeseries', {
                method: 'POST',
                redirect: 'error',
                signal: AbortSignal.timeout(90000),
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  wkt: `POINT(${lon.toFixed(5)} ${lat.toFixed(5)})`,
                  bucket: 'asf-cumulus-prod-opera-products',
                  polarization: 'VV',
                  flightDirection: direction.toUpperCase(),
                }),
              });
              if (!response.ok) {
                await response.body?.cancel();
                throw new Error(
                  'ASF could not supply a time series here. Try another point or orbit direction.',
                );
              }
              const raw = await readResponseJsonCapped(
                response,
                8 * 1024 * 1024,
              );
              const body = {
                longitude: lon,
                latitude: lat,
                direction,
                checkedAt: new Date(now()).toISOString(),
                source: 'NASA OPERA / ASF Displacement Portal',
                units: 'mm LOS',
                measurement: 'Short-wavelength displacement',
                series: normalizeHistory(raw),
                note: 'Provider-derived point history. Positive is toward the satellite. Quality flags may be unavailable; missing observations are not zero. Separate frames are never combined.',
              };
              if (cache.size >= 128) cache.delete(cache.keys().next().value);
              cache.set(key, { time: now(), body });
              return body;
            })().finally(() => pending.delete(key)),
          );
        }
        try {
          reply(200, await pending.get(key));
        } catch {
          reply(502, {
            error:
              'ASF could not supply a time series here. Try another point or orbit direction.',
          });
        }
      },
    );
  }
  return {
    name: 'godseye-opera-national',
    configureServer: install,
    configurePreviewServer: install,
  };
}
