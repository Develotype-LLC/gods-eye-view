import test from 'node:test';
import assert from 'node:assert/strict';
import { OPERATING_PRESETS, matchOperatingPreset } from './pipelinePresets.js';
import { validateInputs, PIPELINE_DEFAULTS } from './pipelineModel.js';
test('operating scenarios use valid inside diameters and preserve custom drafts', () => {
  for (const preset of OPERATING_PRESETS) {
    const values = validateInputs({ ...preset.inputs, weight: 72 });
    assert.equal(matchOperatingPreset(values).id, preset.id);
    assert.equal(matchOperatingPreset({ ...values, electricity: 0.17 }), null);
    const velocity = values.flow * 0.158987294928 / 86400 / (Math.PI * (values.diameter * 0.0254) ** 2 / 4);
    assert.ok(velocity > 1 && velocity < 3);
  }
  assert.equal(matchOperatingPreset(PIPELINE_DEFAULTS), null);
  assert.equal(OPERATING_PRESETS.find(p => p.id === 'gathering').inputs.diameter, 10.293);
});
