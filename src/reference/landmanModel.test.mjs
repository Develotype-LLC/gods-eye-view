import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialLandmanMode,
  LANDMAN_LAYERS,
  LANDMAN_VIEWS,
  filterLandmanLayers,
} from './landmanModel.js';
test('Landman default respects shared scenes and explicit console selection', () => {
  assert.equal(initialLandmanMode(), true);
  assert.equal(initialLandmanMode({ hasShareState: true }), false);
  assert.equal(initialLandmanMode({ preference: 'console' }), false);
  assert.equal(initialLandmanMode({ search: '?view=console' }), false);
  assert.equal(
    initialLandmanMode({
      search: '?view=landman',
      hasShareState: true,
      preference: 'console',
    }),
    true,
  );
});
test('Task views refer to available layers and valid geographic extents', () => {
  const ids = LANDMAN_LAYERS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const view of LANDMAN_VIEWS) {
    assert.ok(view.layers.length);
    for (const id of view.layers) assert.ok(ids.includes(id), id);
    if (view.inspector) assert.ok(view.layers.includes(view.inspector));
    const [w, s, e, n] = view.bounds;
    assert.ok(w < e && s < n && w >= -180 && e <= 180 && s >= -90 && n <= 90);
  }
});
test('Layer search combines source matching with active-only filtering', () => {
  assert.deepEqual(
    filterLandmanLayers('  NASA ').map((l) => l.id),
    ['ground-motion'],
  );
  assert.deepEqual(
    filterLandmanLayers('RRC', true, (l) => l.id === 'rrc-inactive').map(
      (l) => l.id,
    ),
    ['rrc-inactive'],
  );
  assert.equal(filterLandmanLayers('mineral ownership').length, 0);
});
test('Landman hostname opens the workspace even with saved console preferences or a shared map', () => {
  assert.equal(initialLandmanMode({hostname:'landman.develotype.com',hasShareState:true,preference:'console'}),true);
  assert.equal(initialLandmanMode({hostname:'landman.develotype.com',search:'?view=console'}),false);
  assert.equal(initialLandmanMode({hostname:'godseye.develotype.com',hasShareState:true}),false);
});
