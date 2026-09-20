import { readResponseJsonCapped } from './common/http.js';

export const OPERA_COLLECTION = 'OPERA_L3_DISP-S1_V1';
export const OPERA_FRAME = 'F20697';
const compactDate = value => `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`;

export function normalizeOperaEntry(entry) {
  const id = entry?.producer_granule_id || entry?.title;
  const match = /^OPERA_L3_DISP-S1_IW_(F\d+)_VV_(\d{8}T\d{6})Z_(\d{8}T\d{6})Z_v[\d.]+_(\d{8}T\d{6})Z$/.exec(id);
  if (!match || match[1] !== OPERA_FRAME) throw new Error('Unexpected NASA granule');
  const dates = match.slice(2).map(compactDate);
  if (dates.some(date => !Number.isFinite(Date.parse(date)))) throw new Error('Invalid NASA dates');
  return {id, frame: match[1], referenceDate: dates[0], acquisitionDate: dates[1], processedAt: dates[2]};
}

/** Public metadata only: no credentials, arbitrary upstream URLs, or product downloads. */
export function groundMotionProxy({fetchImpl = (...args) => fetch(...args), now = () => Date.now()} = {}) {
  let cached, pending, retryAt = 0;
  async function check() {
    if (cached && now() - Date.parse(cached.checkedAt) < 15 * 60_000) return cached;
    if (pending) return pending;
    if (now() < retryAt) throw new Error('NASA catalog temporarily unavailable');
    pending = (async () => {
      const url = new URL('https://cmr.earthdata.nasa.gov/search/granules.json');
      url.search = new URLSearchParams({short_name: OPERA_COLLECTION,
        producer_granule_id: `OPERA_L3_DISP-S1_IW_${OPERA_FRAME}_*`,
        'options[producer_granule_id][pattern]': 'true', sort_key: '-end_date', page_size: '10'});
      const response = await fetchImpl(url.toString(), {signal: AbortSignal.timeout(12_000), redirect: 'error', headers: {Accept: 'application/json'}});
      if (!response.ok) {await response.body?.cancel(); throw new Error('NASA catalog unavailable');}
      const body = await readResponseJsonCapped(response, 1024 * 1024);
      if (!Array.isArray(body?.feed?.entry) || !body.feed.entry.length) throw new Error('No NASA granules returned');
      const granules = body.feed.entry.map(normalizeOperaEntry).sort((a, b) => b.acquisitionDate.localeCompare(a.acquisitionDate));
      const hits = Number(response.headers.get('CMR-Hits'));
      cached = {collection: OPERA_COLLECTION, frame: OPERA_FRAME, checkedAt: new Date(now()).toISOString(),
        granuleCount: Number.isInteger(hits) && hits >= granules.length ? hits : null,
        latest: granules[0], recent: granules,
        sourceUrl: 'https://search.earthdata.nasa.gov/search?q=OPERA_L3_DISP-S1_V1',
        note: 'Available acquisitions for this collection and frame. Displayed rasters update only after processing and publication.'};
      return cached;
    })().catch(error => {retryAt = now() + 60_000; throw error;}).finally(() => {pending = null;});
    return pending;
  }
  function install(server) {
    server.middlewares.use('/api/reference/ground-motion/availability', async (req, res) => {
      const reply = (code, body) => {res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body));};
      if (req.method !== 'GET') return reply(405, {error: 'Method not allowed'});
      if (new URL(req.url || '/', 'http://localhost').search) return reply(400, {error: 'This endpoint checks the installed pilot frame only'});
      try {return reply(200, await check());}
      catch {return reply(502, {error: 'NASA catalog temporarily unavailable. Displayed snapshot is unchanged.'});}
    });
  }
  return {name: 'godseye-ground-motion', configureServer: install, configurePreviewServer: install};
}
