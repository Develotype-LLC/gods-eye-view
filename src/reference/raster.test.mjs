import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleRaster, validateRaster } from './raster.js';
const grid = {width: 2, height: 2, bounds: [-103, 31, -102, 32], image: 'displacement.png', values: 'displacement.f32'};
const buffer = new ArrayBuffer(16), values = new DataView(buffer);
[0, -2, 5, NaN].forEach((value, i) => values.setFloat32(i * 4, value, true));
test('samples north-to-south little-endian pixels and keeps zero distinct from no data', () => {
  assert.equal(sampleRaster(grid, buffer, -102.9, 31.9).value, 0);
  assert.equal(sampleRaster(grid, buffer, -102.1, 31.9).value, -2);
  assert.equal(sampleRaster(grid, buffer, -102.9, 31.1).value, 5);
  assert.equal(sampleRaster(grid, buffer, -102.1, 31.1).status, 'no-data');
  assert.equal(sampleRaster(grid, buffer, -102, 31.9).status, 'outside');
  assert.equal(sampleRaster(grid, buffer, -102.9, 31).status, 'outside');
  assert.equal(sampleRaster(grid, buffer, -103, 32).value, 0);
});
test('rejects wrong byte counts, oversized grids and unsafe file paths', () => {
  assert.throws(() => sampleRaster(grid, new ArrayBuffer(4), -102.9, 31.9), /byte count/);
  assert.throws(() => validateRaster({...grid, width: 4_000_001}), /metadata/);
  assert.throws(() => validateRaster({...grid, image: '../secret.png'}), /asset/);
});
