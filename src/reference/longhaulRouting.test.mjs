import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUTING_DEFAULTS as defaults,
  studyBounds,
  generateLonghaulRoutes,
  createRoutingContext,
  routeFacts,
  validateExclusions,
  readWaypoints,
  intersection,
} from './longhaulRouting.js';
import {
  infrastructureBounds,
  fetchInfrastructure,
} from '../../server/providers/longhaulInfrastructure.js';
const points = [
    [-102.02, 31],
    [-101.98, 31],
  ],
  bounds = studyBounds(points);
test('crossing penalties change the searched path, rather than just relabeling alternatives', async () => {
  const features = [
    {
      id: 'road',
      kind: 'majorRoad',
      name: 'Test highway',
      coordinates: [
        [-102, 30.994],
        [-102, 31.006],
      ],
    },
  ];
  const { routes } = await generateLonghaulRoutes({
    points,
    bounds,
    features,
    preferences: { ...defaults, corridor: 'neutral', majorRoad: 10 },
  });
  assert.equal(routes[0].routing.counts.majorRoad, 1);
  assert.equal(routes[1].routing.counts.majorRoad, 0);
  assert.ok(routes[1].routing.lengthM > routes[0].routing.lengthM);
});
test('parallel corridor preference changes routing and operator filter restricts the discount', async () => {
  const features = [
    {
      id: 'pipe',
      kind: 'pipeline',
      name: 'Partner A',
      coordinates: [
        [-102.022, 31.005],
        [-101.978, 31.005],
      ],
    },
  ];
  const { routes } = await generateLonghaulRoutes({
    points,
    bounds,
    features,
    preferences: { ...defaults, discount: 70 },
  });
  assert.ok(routes[1].routing.followingPct > 50);
  assert.equal(routes[0].routing.followingPct, 0);
  const facts = routeFacts(
    routes[1].coordinates,
    createRoutingContext(bounds, features),
    { ...defaults, operator: 'Other partner' },
  );
  assert.equal(facts.followingM, 0);
});
test('required waypoints are preserved and every segment respects hard exclusion polygons', async () => {
  const polygon = [
    [-102.003, 30.998],
    [-101.997, 30.998],
    [-101.997, 31.002],
    [-102.003, 31.002],
  ];
  const via = [-102.01, 31.006],
    chain = [points[0], via, points[1]];
  const result = await generateLonghaulRoutes({
    points: chain,
    bounds: studyBounds(chain),
    features: [],
    exclusions: [polygon],
  });
  for (const route of result.routes) {
    assert.ok(
      route.coordinates.some(
        (p) => Math.hypot(p[0] - via[0], p[1] - via[1]) < 1e-9,
      ),
    );
    for (let i = 1; i < route.coordinates.length; i++)
      for (let j = 0; j < polygon.length; j++)
        assert.equal(
          intersection(
            route.coordinates[i - 1],
            route.coordinates[i],
            polygon[j],
            polygon[(j + 1) % polygon.length],
          ),
          null,
        );
  }
  await assert.rejects(
    generateLonghaulRoutes({
      points: [[-102, 31], points[1]],
      bounds,
      features: [],
      exclusions: [polygon],
    }),
    /inside an exclusion/,
  );
});
test('limits and malformed exclusions fail explicitly; cancelled analysis does not return routes', async () => {
  assert.throws(() => readWaypoints('31, nope'));
  assert.throws(() =>
    validateExclusions([
      [
        [-102, 31],
        [-101, 32],
        [-102, 32],
        [-101, 31],
      ],
    ]),
  );
  assert.throws(() => infrastructureBounds('-180,-90,180,90'));
  assert.doesNotThrow(() =>
    studyBounds([
      [-102, 31],
      [-101, 31],
    ]),
  );
  const c = new AbortController();
  c.abort();
  await assert.rejects(
    generateLonghaulRoutes({ points, bounds, features: [], signal: c.signal }),
    /abort/i,
  );
});
test('failed crossing sources stay unavailable, not an authoritative empty crossing inventory', async () => {
  const mock = async (url) =>
    new Response(
      JSON.stringify(
        String(url).includes('texas.gov')
          ? { features: [] }
          : { remark: 'runtime error', elements: [] },
      ),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  const result = await fetchInfrastructure('-103,31,-102.99,31.01', mock);
  assert.equal(result.sources[0].status, 'available');
  assert.equal(result.sources[1].status, 'unavailable');
});
