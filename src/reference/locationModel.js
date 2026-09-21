export function heightDifference(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) ? b - a : null;
}
export function divergingColor(value, range = 100) {
  if (!Number.isFinite(value)) return [0, 0, 0, 0];
  const t = Math.min(1, Math.abs(value) / range),
    base = [235, 231, 203],
    end = value < 0 ? [39, 142, 196] : [215, 78, 43];
  return [...base.map((v, i) => Math.round(v + (end[i] - v) * t)), 190];
}
/** Polygon containment with holes; boundary points count as contained. */
export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (
      Math.abs((x - xi) * (yj - yi) - (y - yi) * (xj - xi)) < 1e-10 &&
      x >= Math.min(xi, xj) &&
      x <= Math.max(xi, xj) &&
      y >= Math.min(yi, yj) &&
      y <= Math.max(yi, yj)
    )
      return true;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
export function containsPoint(geometry, point) {
  const polys =
    geometry?.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry?.type === 'MultiPolygon'
        ? geometry.coordinates
        : [];
  return polys.some(
    (rings) =>
      pointInRing(point, rings[0]) &&
      !rings.slice(1).some((r) => pointInRing(point, r)),
  );
}
