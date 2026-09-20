/** Keep browser-restricted tile credentials out of server-side geocoding. */
export function createGeocodingTransport(fetchImpl = (...args) => fetch(...args)) {
  return (input, options) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.origin === 'https://maps.googleapis.com' && url.pathname === '/maps/api/geocode/json') {
      url.searchParams.delete('key');
      return fetchImpl(`/api/google/geocode?${url.searchParams}`, options);
    }
    return fetchImpl(input, options);
  };
}
