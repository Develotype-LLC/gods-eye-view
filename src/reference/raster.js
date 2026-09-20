export function validateRaster(variant) {
  if (!Number.isInteger(variant?.width) || !Number.isInteger(variant?.height) ||
      variant.width < 1 || variant.height < 1 || variant.width * variant.height > 4_000_000 ||
      !Array.isArray(variant.bounds) || variant.bounds.length !== 4 || !variant.bounds.every(Number.isFinite)) {
    throw new Error('Invalid ground-motion raster metadata');
  }
  const [west, south, east, north] = variant.bounds;
  if (west >= east || south >= north || west < -180 || east > 180 || south < -90 || north > 90) {
    throw new Error('Invalid ground-motion bounds');
  }
  for (const file of [variant.image, variant.values]) {
    if (!/^[a-z_]+\.(png|f32)$/.test(file)) throw new Error('Invalid raster asset');
  }
  return variant;
}

/** Nearest display-grid cell; missing and outside coverage are separate outcomes. */
export function sampleRaster(variant, buffer, longitude, latitude) {
  validateRaster(variant);
  if (buffer.byteLength !== variant.width * variant.height * 4) throw new Error('Raster byte count mismatch');
  const [west, south, east, north] = variant.bounds;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < west || longitude >= east || latitude <= south || latitude > north) {
    return {status: 'outside'};
  }
  const column = Math.floor((longitude - west) / (east - west) * variant.width);
  const row = Math.floor((north - latitude) / (north - south) * variant.height);
  const value = new DataView(buffer).getFloat32((row * variant.width + column) * 4, true);
  return {status: Number.isFinite(value) ? 'value' : 'no-data', value: Number.isFinite(value) ? value : null,
    longitude: west + (column + 0.5) / variant.width * (east - west),
    latitude: north - (row + 0.5) / variant.height * (north - south)};
}
