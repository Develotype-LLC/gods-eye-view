// Preliminary liquid-pipeline screening; SI internally, user inputs explicit.
const R = 6371008.8;
export const PIPELINE_DEFAULTS = Object.freeze({
  flow: 100000,
  diameter: 12,
  density: 1100,
  viscosity: 1.2,
  roughness: 0.0015,
  efficiency: 70,
  electricity: 0.1,
  hours: 8000,
  delivery: 30,
  width: 100,
  weight: 50,
});
export function distance(a, b) {
  const r = Math.PI / 180,
    dy = (b[1] - a[1]) * r,
    dx = (b[0] - a[0]) * r;
  return (
    2 *
    R *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin(dy / 2) ** 2 +
            Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dx / 2) ** 2,
        ),
      ),
    )
  );
}
export function parseEndpoint(text) {
  const values = String(text)
    .split(',')
    .map((s) => s.trim());
  if (values.length !== 2 || values.some((v) => !v))
    throw Error('Enter latitude, longitude for each endpoint.');
  const [lat, lon] = values.map(Number);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < 25 ||
    lat > 37 ||
    lon < -107 ||
    lon > -93
  )
    throw Error(
      'Use Texas pilot coordinates: latitude 25–37, longitude −107 to −93.',
    );
  return [lon, lat];
}
export function validateInputs(input) {
  const limits = {
    flow: [1, 2000000],
    diameter: [2, 60],
    density: [900, 1500],
    viscosity: [0.2, 100],
    roughness: [0, 5],
    efficiency: [10, 95],
    electricity: [0, 2],
    hours: [1, 8760],
    delivery: [0, 2000],
    width: [10, 500],
    weight: [0, 100],
  };
  for (const [key, [lo, hi]] of Object.entries(limits))
    if (!Number.isFinite(input[key]) || input[key] < lo || input[key] > hi)
      throw Error(`Check ${key}: allowed range ${lo}–${hi}.`);
  return input;
}
export function candidateRoutes(a, b) {
  const length = distance(a, b);
  if (length < 250 || length > 50000)
    throw Error(
      'Choose endpoints 0.25–50 km apart for this first corridor comparison.',
    );
  const c = Math.cos(((a[1] + b[1]) * Math.PI) / 360),
    dx = (b[0] - a[0]) * c,
    dy = b[1] - a[1];
  const point = (t, offset) => [
    a[0] + (b[0] - a[0]) * t - (dy * offset) / c,
    a[1] + (b[1] - a[1]) * t + dx * offset,
  ];
  const variants = [
    ['Direct', []],
    ['Left near', [[0.5, 0.12]]],
    ['Right near', [[0.5, -0.12]]],
    ['Left wide', [[0.5, 0.25]]],
    ['Right wide', [[0.5, -0.25]]],
    [
      'S north',
      [
        [0.33, 0.15],
        [0.67, -0.15],
      ],
    ],
    [
      'S south',
      [
        [0.33, -0.15],
        [0.67, 0.15],
      ],
    ],
  ];
  return variants.map(([name, via], i) => ({
    id: 'route-' + i,
    name,
    coordinates: [a, ...via.map(([t, o]) => point(t, o)), b],
  }));
}
export function sampleRoute(coordinates, segments = 24) {
  const lengths = coordinates
      .slice(1)
      .map((b, i) => distance(coordinates[i], b)),
    total = lengths.reduce((a, b) => a + b, 0),
    points = [];
  for (let i = 0; i <= segments; i++) {
    let left = (total * i) / segments,
      k = 0;
    while (k < lengths.length - 1 && left > lengths[k]) left -= lengths[k++];
    const t = lengths[k] ? left / lengths[k] : 0,
      a = coordinates[k],
      b = coordinates[k + 1];
    points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return points;
}
export function hydraulics(points, heights, input) {
  validateInputs(input);
  if (
    points.length !== heights.length ||
    heights.some((x) => typeof x !== 'number' || !Number.isFinite(x))
  )
    return null;
  const q = (input.flow * 0.158987294928) / 86400,
    d = input.diameter * 0.0254,
    velocity = q / ((Math.PI * d * d) / 4),
    re = (input.density * velocity * d) / (input.viscosity * 0.001);
  let f = 64 / re;
  if (re >= 2300) {
    let inv = 1 / Math.sqrt(0.02);
    for (let i = 0; i < 20; i++)
      inv =
        -2 *
        Math.log10((input.roughness * 0.001) / (3.7 * d) + (2.51 * inv) / re);
    f = 1 / (inv * inv);
  }
  const metres = [0];
  for (let i = 1; i < points.length; i++)
    metres.push(metres[i - 1] + distance(points[i - 1], points[i]));
  const friction = metres.map(
      (s) => (((f * s) / d) * velocity ** 2) / (2 * 9.80665),
    ),
    deliveryHead = (input.delivery * 6894.757293) / (input.density * 9.80665);
  const head = Math.max(
    0,
    ...heights.map(
      (z, i) =>
        z -
        heights[0] +
        friction[i] +
        (i === heights.length - 1 ? deliveryHead : 0),
    ),
  );
  const kw =
    (input.density * 9.80665 * q * head) / (input.efficiency / 100) / 1000;
  return {
    lengthM: metres.at(-1),
    distanceM: metres,
    heights,
    frictionM: friction.at(-1),
    headM: head,
    powerKw: kw,
    annualCost: kw * input.hours * input.electricity,
    velocity,
    reynolds: re,
    transition: re >= 2300 && re < 4000,
    maxSampleGapM: Math.max(...metres.slice(1).map((s, i) => s - metres[i])),
    riseM: heights.at(-1) - heights[0],
    pressurePsi: (input.density * 9.80665 * head) / 6894.757293,
  };
}
export function rankRoutes(routes, weight = 50) {
  const eligible = routes.filter(
    (r) =>
      r.hydraulics &&
      r.land.coverage >= 0.99999 &&
      !r.land.truncated &&
      r.land.unknownParcels === 0,
  );
  if (!eligible.length)
    return { eligible: [], energy: null, owners: null, balanced: null };
  const norm = (v, min, max) => (max === min ? 0 : (v - min) / (max - min));
  const costs = eligible.map((r) => r.hydraulics.annualCost),
    owners = eligible.map((r) => r.land.ownerCount),
    score = (r) =>
      (1 - weight / 100) *
        norm(r.hydraulics.annualCost, Math.min(...costs), Math.max(...costs)) +
      (weight / 100) *
        norm(r.land.ownerCount, Math.min(...owners), Math.max(...owners));
  const order = (fn) =>
    [...eligible].sort(
      (a, b) => fn(a) - fn(b) || a.hydraulics.lengthM - b.hydraulics.lengthM,
    )[0].id;
  return {
    eligible: eligible.map((r) => r.id),
    energy: order((r) => r.hydraulics.annualCost),
    owners: order((r) => r.land.ownerCount),
    balanced: order(score),
  };
}
