import { distance, parseEndpoint } from './pipelineModel.js';
export const ROUTING_DEFAULTS = Object.freeze({
  corridor: 'prefer',
  operator: '',
  discount: 30,
  majorRoad: 5,
  road: 0.5,
  rail: 8,
  water: 3,
});
export function readWaypoints(text) {
  const lines = String(text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length > 8) throw Error('Use up to eight required waypoints.');
  return lines.map(parseEndpoint);
}
export function validateRouting(p) {
  if (
    !p ||
    !['prefer', 'neutral', 'avoid'].includes(p.corridor) ||
    typeof p.operator !== 'string' ||
    p.operator.length > 120
  )
    throw Error('Invalid corridor preference');
  for (const k of ['discount', 'majorRoad', 'road', 'rail', 'water'])
    if (
      !Number.isFinite(p[k]) ||
      p[k] < 0 ||
      p[k] > (k === 'discount' ? 70 : 100)
    )
      throw Error('Invalid routing penalty: ' + k);
  return p;
}
export function validateExclusions(polygons) {
  if (!Array.isArray(polygons) || polygons.length > 10)
    throw Error('Use up to ten exclusion areas.');
  for (const ring of polygons) {
    if (!Array.isArray(ring) || ring.length < 3 || ring.length > 50)
      throw Error('Each exclusion needs 3–50 vertices.');
    for (const p of ring) {
      if (!Array.isArray(p) || p.length !== 2)
        throw Error('Invalid exclusion vertex');
      parseEndpoint(`${p[1]},${p[0]}`);
    }
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    if (Math.abs(area) < 1e-9)
      throw Error('Exclusion area is too small or has zero area.');
    for (let i = 0; i < ring.length; i++)
      for (let j = i + 2; j < ring.length; j++)
        if (
          !(i === 0 && j === ring.length - 1) &&
          intersection(
            ring[i],
            ring[(i + 1) % ring.length],
            ring[j],
            ring[(j + 1) % ring.length],
          )
        )
          throw Error('Exclusion edges must not cross each other.');
  }
  return polygons;
}
export function studyBounds(points, exclusions = []) {
  if (points.length < 2) throw Error('Set source and delivery.');
  points.forEach((p) => parseEndpoint(`${p[1]},${p[0]}`));
  const total = points
    .slice(1)
    .reduce((n, p, i) => n + distance(points[i], p), 0);
  if (total < 50 || total > 250000)
    throw Error(
      'This interactive study supports a 50 m–250 km source/waypoint/delivery chain.',
    );
  validateExclusions(exclusions);
  // The search has a visible finite envelope; exclusions do not silently expand it.
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const pad = Math.max(
    0.015,
    Math.min(
      0.12,
      Math.max(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
      ) * 0.2,
    ),
  );
  return [
    Math.max(-107, Math.min(...xs) - pad),
    Math.max(25, Math.min(...ys) - pad),
    Math.min(-93, Math.max(...xs) + pad),
    Math.min(37, Math.max(...ys) + pad),
  ];
}
const cross = (a, b) => a[0] * b[1] - a[1] * b[0],
  sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
// Returns a point for a proper crossing or touch. Collinear travel is not a crossing.
export function intersection(a, b, c, d) {
  const r = sub(b, a),
    s = sub(d, c),
    den = cross(r, s);
  if (Math.abs(den) < 1e-10) return null;
  const t = cross(sub(c, a), s) / den,
    u = cross(sub(c, a), r) / den;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9
    ? [a[0] + t * r[0], a[1] + t * r[1]]
    : null;
}
export function inside(p, ring) {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j],
      v = sub(b, a),
      w = sub(p, a);
    if (v[0] * v[0] + v[1] * v[1] < 1e-12) continue;
    if (
      Math.abs(cross(v, w)) < 1e-7 &&
      w[0] * v[0] + w[1] * v[1] >= 0 &&
      w[0] * v[0] + w[1] * v[1] <= v[0] * v[0] + v[1] * v[1]
    )
      return true;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      yes = !yes;
  }
  return yes;
}
function pointDistance(p, a, b) {
  const v = sub(b, a),
    w = sub(p, a),
    t = Math.max(
      0,
      Math.min(
        1,
        (w[0] * v[0] + w[1] * v[1]) / (v[0] * v[0] + v[1] * v[1] || 1),
      ),
    );
  return Math.hypot(p[0] - a[0] - t * v[0], p[1] - a[1] - t * v[1]);
}
class Heap {
  a = [];
  push(v) {
    let i = this.a.push(v) - 1;
    while (i) {
      const p = (i - 1) >> 1;
      if (this.a[p][0] <= v[0]) break;
      this.a[i] = this.a[p];
      i = p;
    }
    this.a[i] = v;
  }
  pop() {
    const top = this.a[0],
      v = this.a.pop();
    if (this.a.length) {
      let i = 0;
      while (i * 2 + 1 < this.a.length) {
        let c = i * 2 + 1;
        if (c + 1 < this.a.length && this.a[c + 1][0] < this.a[c][0]) c++;
        if (this.a[c][0] >= v[0]) break;
        this.a[i] = this.a[c];
        i = c;
      }
      this.a[i] = v;
    }
    return top;
  }
}
export function createRoutingContext(bounds, features, exclusions = []) {
  validateExclusions(exclusions);
  const cos = Math.cos(((bounds[1] + bounds[3]) * Math.PI) / 360),
    origin = [bounds[0], bounds[1]];
  const project = (p) => [
      (p[0] - origin[0]) * 111195 * cos,
      (p[1] - origin[1]) * 111195,
    ],
    unproject = (p) => [
      p[0] / (111195 * cos) + origin[0],
      p[1] / 111195 + origin[1],
    ];
  const extent = project([bounds[2], bounds[3]]),
    step = Math.max(
      75,
      Math.ceil(Math.sqrt((extent[0] * extent[1]) / 14000) / 25) * 25,
      Math.ceil(Math.max(...extent) / 220 / 25) * 25,
    );
  const nx = Math.ceil(extent[0] / step) + 1,
    ny = Math.ceil(extent[1] / step) + 1,
    n = nx * ny,
    polygons = exclusions.map((r) => r.map(project));
  let indexEntries = 0;
  const cell = 500,
    index = new Map(),
    segments = [];
  for (const f of features) {
    if (
      !['pipeline', 'majorRoad', 'road', 'rail', 'water'].includes(f.kind) ||
      !Array.isArray(f.coordinates)
    )
      continue;
    for (let i = 1; i < f.coordinates.length; i++) {
      const ll = [f.coordinates[i - 1], f.coordinates[i]];
      if (
        ll.some(
          (p) =>
            !Array.isArray(p) ||
            p.length !== 2 ||
            p.some((v) => !Number.isFinite(v)),
        )
      )
        continue;
      const [a, b] = ll.map(project);
      if (
        Math.max(a[0], b[0]) < 0 ||
        Math.min(a[0], b[0]) > extent[0] ||
        Math.max(a[1], b[1]) < 0 ||
        Math.min(a[1], b[1]) > extent[1]
      )
        continue;
      const id = segments.length;
      segments.push({ a, b, feature: f });
      for (
        let x = Math.max(-1, Math.floor(Math.min(a[0], b[0]) / cell));
        x <=
        Math.min(
          Math.ceil(extent[0] / cell),
          Math.floor(Math.max(a[0], b[0]) / cell),
        );
        x++
      )
        for (
          let y = Math.max(-1, Math.floor(Math.min(a[1], b[1]) / cell));
          y <=
          Math.min(
            Math.ceil(extent[1] / cell),
            Math.floor(Math.max(a[1], b[1]) / cell),
          );
          y++
        ) {
          const key = x + ',' + y;
          if (!index.has(key)) index.set(key, []);
          if (++indexEntries > 1000000)
            throw Error(
              'Infrastructure is too dense for this interactive study. Narrow the study area.',
            );
          index.get(key).push(id);
        }
    }
  }
  const xy = (id) => [(id % nx) * step, Math.floor(id / nx) * step];
  const blocked = (a, b) =>
    polygons.some(
      (r) =>
        inside(a, r) ||
        inside(b, r) ||
        r.some((c, i) => intersection(a, b, c, r[(i + 1) % r.length])),
    );
  const candidates = (a, b, radius = 100) => {
    const ids = new Set();
    for (
      let x = Math.floor((Math.min(a[0], b[0]) - radius) / cell);
      x <= Math.floor((Math.max(a[0], b[0]) + radius) / cell);
      x++
    )
      for (
        let y = Math.floor((Math.min(a[1], b[1]) - radius) / cell);
        y <= Math.floor((Math.max(a[1], b[1]) + radius) / cell);
        y++
      )
        for (const id of index.get(x + ',' + y) || []) ids.add(id);
    return [...ids].map((i) => segments[i]);
  };
  function edge(a, b, operator = '') {
    if (blocked(a, b)) return null;
    const length = Math.hypot(...sub(b, a)),
      direction = sub(b, a),
      mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      events = [];
    let follows = false;
    for (const s of candidates(a, b)) {
      if (s.feature.kind === 'pipeline') {
        if (
          operator &&
          !String(s.feature.name).toLowerCase().includes(operator.toLowerCase())
        )
          continue;
        const v = sub(s.b, s.a),
          alignment =
            Math.abs(direction[0] * v[0] + direction[1] * v[1]) /
            (length * Math.hypot(...v) || 1);
        if (alignment >= 0.85 && pointDistance(mid, s.a, s.b) <= 100)
          follows = true;
      } else {
        const hit = intersection(a, b, s.a, s.b);
        if (
          hit &&
          !events.some(
            (e) =>
              e.kind === s.feature.kind && Math.hypot(...sub(e.point, hit)) < 2,
          )
        )
          events.push({
            kind: s.feature.kind,
            name: s.feature.name,
            id: s.feature.id,
            point: hit,
          });
      }
    }
    return { length, follows, events };
  }
  return {
    bounds,
    step,
    nx,
    ny,
    n,
    extent,
    xy,
    project,
    unproject,
    edge,
    blocked,
  };
}
const edgeCost = (e, p, mode) =>
  e.length *
    (e.follows
      ? p.corridor === 'prefer'
        ? 1 - p.discount / 100
        : p.corridor === 'avoid'
          ? 2
          : 1
      : 1) +
  (mode === 'distance'
    ? 0
    : e.events.reduce(
        (s, x) => s + p[x.kind] * 1000 * (mode === 'crossings' ? 3 : 1),
        0,
      ));
export function routeFacts(coordinates, context, p) {
  let length = 0,
    following = 0;
  const crossings = [];
  for (let i = 1; i < coordinates.length; i++) {
    // Sample long straight runs so the proximity fraction is not decided by one midpoint.
    const a = context.project(coordinates[i - 1]),
      b = context.project(coordinates[i]),
      pieces = Math.max(1, Math.ceil(Math.hypot(...sub(b, a)) / 75));
    for (let j = 0; j < pieces; j++) {
      const x = [
          a[0] + ((b[0] - a[0]) * j) / pieces,
          a[1] + ((b[1] - a[1]) * j) / pieces,
        ],
        y = [
          a[0] + ((b[0] - a[0]) * (j + 1)) / pieces,
          a[1] + ((b[1] - a[1]) * (j + 1)) / pieces,
        ],
        e = context.edge(x, y, p.operator);
      if (!e)
        throw Error(
          'A route intersects an exclusion. Re-run with a wider study or different waypoint.',
        );
      length += e.length;
      if (e.follows) following += e.length;
      for (const hit of e.events)
        if (
          !crossings.some(
            (v) =>
              v.kind === hit.kind &&
              Math.hypot(...sub(v.point, hit.point)) < 10,
          )
        )
          crossings.push(hit);
    }
  }
  const counts = Object.fromEntries(
    ['majorRoad', 'road', 'rail', 'water'].map((k) => [
      k,
      crossings.filter((e) => e.kind === k).length,
    ]),
  );
  return {
    lengthM: length,
    followingM: following,
    followingPct: length ? (following / length) * 100 : 0,
    crossings: crossings.map((e) => ({
      ...e,
      point: context.unproject(e.point),
    })),
    counts,
    scoreKm:
      (length +
        following *
          (p.corridor === 'prefer'
            ? -p.discount / 100
            : p.corridor === 'avoid'
              ? 1
              : 0) +
        Object.entries(counts).reduce((n, [k, v]) => n + v * p[k] * 1000, 0)) /
      1000,
  };
}
async function search(context, startLL, endLL, p, mode, signal) {
  const { n, nx, ny, xy, step, project, unproject, edge, extent } = context,
    start = project(startLL),
    end = project(endLL),
    source = n,
    target = n + 1;
  if (context.blocked(start, start) || context.blocked(end, end))
    throw Error(
      'An endpoint or required waypoint lies inside an exclusion area.',
    );
  const nearby = (p) => {
    const out = [],
      x = Math.round(p[0] / step),
      y = Math.round(p[1] / step);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const a = x + dx,
          b = y + dy;
        if (
          a >= 0 &&
          b >= 0 &&
          a < nx &&
          b < ny &&
          a * step <= extent[0] &&
          b * step <= extent[1]
        )
          out.push(b * nx + a);
      }
    return out;
  };
  const goalNeighbors = new Set(nearby(end)),
    sourceNeighbors = nearby(start),
    point = (id) => (id === source ? start : id === target ? end : xy(id));
  const g = new Float64Array(n + 2).fill(Infinity),
    parent = new Int32Array(n + 2).fill(-1),
    done = new Uint8Array(n + 2),
    heap = new Heap();
  const preference = mode === 'distance' ? { ...p, corridor: 'neutral' } : p;
  const heuristic = (id) =>
    Math.hypot(...sub(point(id), end)) *
    (preference.corridor === 'prefer' ? 1 - preference.discount / 100 : 1);
  g[source] = 0;
  heap.push([heuristic(source), source]);
  let iterations = 0;
  while (heap.a.length) {
    if (++iterations % 1500 === 0) {
      await new Promise((r) => setTimeout(r, 0));
      signal?.throwIfAborted();
    }
    const [, id] = heap.pop();
    if (done[id]) continue;
    done[id] = 1;
    if (id === target) {
      const path = [];
      for (let v = id; v !== -1; v = parent[v]) path.push(point(v));
      path.reverse();
      const compact = [];
      for (const v of path) {
        while (compact.length > 1) {
          const a = compact.at(-2),
            b = compact.at(-1);
          if (Math.abs(cross(sub(b, a), sub(v, b))) > 1e-5) break;
          compact.pop();
        }
        if (!compact.length || Math.hypot(...sub(v, compact.at(-1))) > 0.01)
          compact.push(v);
      }
      return compact.map(unproject);
    }
    const neighbors =
      id === source
        ? [
            ...sourceNeighbors,
            ...(Math.hypot(...sub(start, end)) < step * 2 ? [target] : []),
          ]
        : [];
    if (id < n) {
      const x = id % nx,
        y = Math.floor(id / nx);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          const a = x + dx,
            b = y + dy;
          if (
            a >= 0 &&
            b >= 0 &&
            a < nx &&
            b < ny &&
            a * step <= extent[0] &&
            b * step <= extent[1]
          )
            neighbors.push(b * nx + a);
        }
      if (goalNeighbors.has(id)) neighbors.push(target);
    }
    for (const next of neighbors) {
      if (done[next]) continue;
      const e = edge(point(id), point(next), preference.operator);
      if (!e) continue;
      const cost = g[id] + edgeCost(e, preference, mode);
      if (cost < g[next]) {
        g[next] = cost;
        parent[next] = id;
        heap.push([cost + heuristic(next), next]);
      }
    }
  }
  throw Error(
    'No route found within this study envelope and exclusion areas. Move a waypoint or revise an exclusion.',
  );
}
export async function generateLonghaulRoutes({
  points,
  bounds,
  features,
  exclusions = [],
  preferences = ROUTING_DEFAULTS,
  signal,
  onProgress = () => {},
}) {
  validateRouting(preferences);
  studyBounds(points, exclusions);
  signal?.throwIfAborted();
  const context = createRoutingContext(bounds, features, exclusions),
    routes = [];
  for (const [mode, name] of [
    ['distance', 'Distance first'],
    ['balanced', 'Infrastructure balance'],
    ['crossings', 'Crossing avoidance'],
  ]) {
    const coordinates = [];
    for (let i = 1; i < points.length; i++) {
      onProgress(
        `${name}: routing leg ${i}/${points.length - 1} at ${context.step} m grid resolution…`,
      );
      const leg = await search(
        context,
        points[i - 1],
        points[i],
        preferences,
        mode,
        signal,
      );
      coordinates.push(...(i === 1 ? leg : leg.slice(1)));
    }
    if (coordinates.length > 1500)
      throw Error(
        'Route exceeds the interactive geometry budget. Use fewer waypoints.',
      );
    routes.push({
      id: 'route-' + routes.length,
      name,
      coordinates,
      routing: routeFacts(coordinates, context, preferences),
    });
  }
  return {
    routes,
    resolutionM: context.step,
    bounds,
    followingToleranceM: 100,
  };
}
