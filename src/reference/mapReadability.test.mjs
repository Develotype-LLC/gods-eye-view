import test from 'node:test';
import assert from 'node:assert/strict';
import { DataLayerManager } from '../data/manager.js';
import { mountSurfacePolicy } from './surfacePolicy.js';
import { etColor, NO_OBSERVATION, ET_COLORS } from './mapSymbols.js';
test('missing ET never shares a measurement swatch; scale is fixed and capped', () => {
  for (const missing of [null, undefined, NaN, Infinity]) assert.equal(etColor(missing), NO_OBSERVATION);
  assert.notEqual(etColor(0), NO_OBSERVATION);
  assert.equal(etColor(0), ET_COLORS[0]);
  assert.equal(etColor(60), ET_COLORS[1]);
  assert.equal(etColor(300), etColor(500));
});
test('newest surface request wins even during concurrent activation; console is unaffected', {timeout: 4000}, async () => {
  const manager = new DataLayerManager({});
  for (const id of ['terrain-difference','ground-motion']) manager.register({id, name:id, updateInterval:0, async init(){return true;}, async enable(){await Promise.resolve(); return true;}, disable(){return true;}, update(){return true;}});
  let active = true;
  const errors = [];
  const off = mountSurfacePolicy(manager, () => active, e => errors.push(e));
  try {
    await manager.setEnabled('terrain-difference',true);
    await manager.setEnabled('ground-motion',true);
    assert.equal(manager.isEnabled('terrain-difference'),false);
    assert.equal(manager.isEnabled('ground-motion'),true);
    await Promise.all([manager.setEnabled('ground-motion',true),manager.setEnabled('terrain-difference',true)]);
    assert.equal(manager.isEnabled('terrain-difference'),true);
    assert.equal(manager.isEnabled('ground-motion'),false);
    active = false;
    await manager.setEnabled('ground-motion',true);
    assert.equal(manager.isEnabled('terrain-difference'),true);
    assert.equal(manager.isEnabled('ground-motion'),true);
    assert.deepEqual(errors,[]);
  } finally {off(); await manager.setEnabled('ground-motion',false); await manager.setEnabled('terrain-difference',false);}
});
