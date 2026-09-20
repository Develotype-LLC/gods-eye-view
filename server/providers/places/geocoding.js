import { readResponseJsonCapped } from '../common/http.js';
import { makeRateLimiter } from '../common/rate-limit.js';

/** Fixed-destination geocoder, protected by the deployment's authentication proxy. */
export function googleGeocodingProxy({
  fetchImpl = (...args) => fetch(...args),
  resolveApiKey = () => process.env.GOOGLE_GEOCODING_API_KEY,
} = {}) {
  const allow = makeRateLimiter({windowMs: 60_000, max: 30, globalMax: 30});
  function install(server) {
    server.middlewares.use('/api/google/geocode', async (req, res) => {
      const reply = (code, body) => {
        res.statusCode = code;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(body));
      };
      if (req.method !== 'GET') return reply(405, {error: 'Method not allowed'});
      const params = new URL(req.url || '/', 'http://localhost').searchParams;
      const address = params.get('address')?.trim();
      const latlng = params.get('latlng')?.trim();
      const point = latlng?.split(',').map(Number);
      if (Boolean(address) === Boolean(latlng) || (address && address.length > 500) ||
          (latlng && (!/^[-+\d.]+,[-+\d.]+$/.test(latlng) || point.length !== 2 ||
            !point.every(Number.isFinite) || Math.abs(point[0]) > 90 || Math.abs(point[1]) > 180))) {
        return reply(400, {error: 'Provide an address or valid latitude,longitude'});
      }
      const key = resolveApiKey();
      if (!key) return reply(503, {error: 'Google geocoding is not configured'});
      if (!allow('geocoding')) return reply(429, {error: 'Geocoding rate limit exceeded'});
      const upstream = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      upstream.searchParams.set(address ? 'address' : 'latlng', address || latlng);
      const bounds = params.get('bounds');
      if (address && bounds && bounds.length <= 100) upstream.searchParams.set('bounds', bounds);
      upstream.searchParams.set('key', key);
      try {
        const response = await fetchImpl(upstream.toString(), {signal: AbortSignal.timeout(10_000), redirect: 'error'});
        if (!response.ok) {
          await response.body?.cancel();
          return reply(502, {error: 'Google geocoding unavailable'});
        }
        const data = await readResponseJsonCapped(response, 1024 * 1024);
        if (!['OK', 'ZERO_RESULTS'].includes(data?.status) || !Array.isArray(data.results)) {
          return reply(502, {error: 'Google geocoding unavailable'});
        }
        return reply(200, {status: data.status, results: data.results});
      } catch {
        return reply(502, {error: 'Google geocoding unavailable'});
      }
    });
  }
  return {name: 'godseye-google-geocoding', configureServer: install, configurePreviewServer: install};
}
