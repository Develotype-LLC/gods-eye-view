import { readResponseJsonCapped } from './common/http.js';
const RRC =
  'https://gis.rrc.texas.gov/server/rest/services/rrc_public/RRC_Public_Viewer_Srvs/MapServer/13';
const cache = new Map(),
  pending = new Map();
export function infrastructureBounds(raw) {
  const b = String(raw || '')
    .split(',')
    .map(Number);
  if (
    b.length !== 4 ||
    !b.every(Number.isFinite) ||
    b[0] < -107 ||
    b[2] > -93 ||
    b[1] < 25 ||
    b[3] > 37 ||
    b[0] >= b[2] ||
    b[1] >= b[3] ||
    b[2] - b[0] > 3.5 ||
    b[3] - b[1] > 3.5
  )
    throw Error('Invalid LONG-Haul study bounds');
  return b;
}
export async function fetchInfrastructure(raw, fetchImpl = fetch) {
  const bounds = infrastructureBounds(raw),
    key = bounds.join(',');
  const old = cache.get(key);
  if (old && Date.now() - old.time < 3600000) return old.value;
  if (pending.has(key)) return pending.get(key);
  if (pending.size >= 2)
    throw Error('LONG-Haul infrastructure is busy; try again shortly.');
  const job = load(bounds, fetchImpl)
    .then((value) => {
      if (value.sources.every((s) => s.status === 'available')) {
        if (cache.size >= 8) cache.delete(cache.keys().next().value);
        cache.set(key, { time: Date.now(), value });
      }
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
async function load(bounds, fetchImpl) {
  const at = new Date().toISOString();
  const deadline = AbortSignal.timeout(80000);
  const read = async (url, options = {}) => {
    const response = await fetchImpl(url, {
      ...options,
      signal: AbortSignal.any([deadline, AbortSignal.timeout(35000)]),
      redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Error('Source unavailable');
    }
    return readResponseJsonCapped(response, 24 * 1024 * 1024);
  };
  const pipelines = async () => {
    const features = [];
    for (let offset = 0; offset < 6000; offset += 1000) {
      const q = new URLSearchParams({
        f: 'json',
        where: '1=1',
        geometry: JSON.stringify({
          xmin: bounds[0],
          ymin: bounds[1],
          xmax: bounds[2],
          ymax: bounds[3],
          spatialReference: { wkid: 4326 },
        }),
        geometryType: 'esriGeometryEnvelope',
        spatialRel: 'esriSpatialRelIntersects',
        inSR: '4326',
        outSR: '4326',
        outFields: 'OBJECTID,OPERATOR,COMMODITY_DESCRIPTION,STATUS,T4PERMIT',
        returnGeometry: 'true',
        geometryPrecision: '6',
        orderByFields: 'OBJECTID',
        resultOffset: String(offset),
        resultRecordCount: '1000',
      });
      const d = await read(RRC + '/query?' + q);
      if (d.error || !Array.isArray(d.features))
        throw Error('Invalid RRC response');
      for (const f of d.features)
        for (const [i, coordinates] of (f.geometry?.paths || []).entries())
          features.push({
            id: `rrc-${f.attributes.OBJECTID}-${i}`,
            kind: 'pipeline',
            name: f.attributes.OPERATOR || 'Unspecified operator',
            status: f.attributes.STATUS,
            commodity: f.attributes.COMMODITY_DESCRIPTION,
            permit: f.attributes.T4PERMIT,
            coordinates,
          });
      if (!d.exceededTransferLimit) return { features, status: 'available' };
    }
    return {
      features: [],
      status: 'limit',
      note: 'Pipeline query exceeded 6,000 records. Narrow the study area; no partial inventory used.',
    };
  };
  const barriers = async () => {
    const [w, s, e, n] = bounds,
      box = `(${s},${w},${n},${e})`;
    const query = `[out:json][timeout:30];(way[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|track)(_link)?$"]${box};way[railway=rail]${box};way[waterway~"^(river|stream|canal|drain)$"]${box};);out geom 10001;`;
    let d;
    for (const host of [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.private.coffee/api/interpreter',
    ]) {
      try {
        d = await read(host, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent':
              'LONG-Haul/1.0 (https://landman.develotype.com; route screening)',
          },
          body: new URLSearchParams({ data: query }).toString(),
        });
        if (!d.remark && Array.isArray(d.elements)) break;
      } catch {}
    }
    if (!d) throw Error('Crossing sources unavailable');
    if (d.remark || !Array.isArray(d.elements))
      throw Error('Incomplete OSM response');
    if (d.elements.length > 10000)
      return {
        features: [],
        status: 'limit',
        note: 'Crossing query exceeded 10,000 ways. Narrow the study area; no partial inventory used.',
      };
    return {
      status: 'available',
      features: d.elements
        .filter((f) => f.geometry?.length >= 2)
        .map((f) => ({
          id: 'osm-' + f.id,
          kind: f.tags.railway
            ? 'rail'
            : f.tags.waterway
              ? 'water'
              : /^(motorway|trunk|primary)/.test(f.tags.highway)
                ? 'majorRoad'
                : 'road',
          name:
            f.tags.name ||
            f.tags.ref ||
            f.tags.highway ||
            f.tags.waterway ||
            'Railway',
          coordinates: f.geometry.map((p) => [p.lon, p.lat]),
        })),
    };
  };
  const jobs = await Promise.allSettled([pipelines(), barriers()]);
  const sources = jobs.map((r, i) => ({
    name: i
      ? 'OpenStreetMap roads, railways and waterways'
      : 'Texas RRC mapped pipelines',
    url: i ? 'https://www.openstreetmap.org/copyright' : RRC,
    at,
    status: r.status === 'fulfilled' ? r.value.status : 'unavailable',
    note:
      r.status === 'fulfilled'
        ? r.value.note
        : 'Source request failed; absence of features is not evidence of no infrastructure.',
  }));
  const features = jobs.flatMap((r) =>
    r.status === 'fulfilled' ? r.value.features : [],
  );
  // Geometry cap bounds downstream graph work even when a way contains many vertices.
  if (features.reduce((n, f) => n + f.coordinates.length, 0) > 150000)
    return {
      bounds,
      at,
      features: [],
      sources: sources.map((s) => ({
        ...s,
        status: 'limit',
        note: 'Geometry exceeds the interactive routing budget. Narrow the study area.',
      })),
    };
  return {
    bounds,
    at,
    features,
    sources,
    note: 'Mapped context only. Pipeline proximity does not establish easement access, capacity, constructability or operational status. OSM crossing inventory may be incomplete.',
  };
}
