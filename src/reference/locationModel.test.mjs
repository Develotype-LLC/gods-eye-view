import test from 'node:test';
import assert from 'node:assert/strict';
import {
  heightDifference,
  divergingColor,
  containsPoint,
} from './locationModel.js';
import { parseInspection } from '../../server/providers/inspection.js';
test('relative differences keep direction and missing values separate from zero', () => {
  assert.equal(heightDifference(100, 120), 20);
  assert.equal(heightDifference(100, 80), -20);
  assert.equal(heightDifference(0, 0), 0);
  assert.equal(heightDifference(null, 0), null);
  assert.equal(heightDifference(0, NaN), null);
  assert.equal(divergingColor(NaN)[3], 0);
  assert.deepEqual(divergingColor(100), divergingColor(1000));
  assert.notDeepEqual(divergingColor(-100), divergingColor(100));
});
test('basin containment excludes holes and supports multipart polygons', () => {
  const outer = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ],
    hole = [
      [1, 1],
      [2, 1],
      [2, 2],
      [1, 2],
      [1, 1],
    ],
    g = { type: 'MultiPolygon', coordinates: [[outer, hole]] };
  assert.equal(containsPoint(g, [3, 3]), true);
  assert.equal(containsPoint(g, [1.5, 1.5]), false);
  assert.equal(containsPoint(g, [5, 5]), false);
  assert.equal(containsPoint(g, [0, 0]), true);
});
test('point inspection rejects unbounded and malformed searches', () => {
  assert.deepEqual(
    parseInspection(
      new URLSearchParams({
        longitude: '-102',
        latitude: '32',
        radius: '1000',
      }),
    ),
    [-102, 32, 1000],
  );
  for (const value of [
    { longitude: '', latitude: '32', radius: '1000' },
    { longitude: '181', latitude: '32', radius: '1000' },
    { longitude: '-102', latitude: '86', radius: '1000' },
    { longitude: '-102', latitude: '32', radius: '10000' },
    { longitude: '0;DROP', latitude: '32', radius: '1000' },
  ])
    assert.throws(() => parseInspection(new URLSearchParams(value)), /Invalid/);
});
