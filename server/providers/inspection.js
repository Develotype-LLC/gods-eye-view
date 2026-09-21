/** Bounded point inspection shared by the two local spatial inventories. */
export function parseInspection(params) {
  const raw = ['longitude', 'latitude', 'radius'].map((k) => params.get(k));
  if (raw.some((v) => v === null || v.trim() === ''))
    throw new Error('Invalid inspection coordinates or radius');
  const [longitude, latitude, radius] = raw.map(Number);
  if (
    ![longitude, latitude, radius].every(Number.isFinite) ||
    Math.abs(longitude) > 180 ||
    Math.abs(latitude) > 85 ||
    radius < 25 ||
    radius > 5000
  )
    throw new Error('Invalid inspection coordinates or radius');
  return [longitude, latitude, radius];
}
export const INSPECTION_POINT = 'ST_SetSRID(ST_MakePoint($1,$2),4326)';
export function inspectionWhere(geom) {
  return `${geom} && ST_Expand(ST_Envelope(ST_Buffer(${INSPECTION_POINT}::geography,$3)::geometry),0.001) AND ST_DWithin(${geom}::geography,${INSPECTION_POINT}::geography,$3)`;
}
