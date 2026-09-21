import { PIPELINE_DEFAULTS } from './pipelineModel.js';

// Flow targets are analyst-selected scenarios, not published pipe capacities.
// Average IDs: Chevron Phillips PP501, Table 2, IPS DR11 (October 2021).
const source =
  'https://www.cpchem.com/sites/default/files/2022-03/PP%20501%20Driscoplex%204000%204100%20Water%20Pipe%20Brochure.pdf';
export const OPERATING_PRESETS = [
  ['trunk', 'Trunk line · 100,000 bbl/day', 100000, 16, 12.915],
  ['small', 'Small gathering · 20,000 bbl/day', 20000, 8, 6.963],
  ['gathering', 'Gathering · 50,000 bbl/day', 50000, 12, 10.293],
  ['regional', 'Regional transfer · 250,000 bbl/day', 250000, 24, 19.374],
].map(([id, label, flow, nominal, diameter]) => {
  const { weight, ...shared } = PIPELINE_DEFAULTS;
  return {
    id,
    version: 1,
    label,
    description: `${nominal} in nominal HDPE IPS DR11`,
    source,
    basis:
      'Published pipe dimensions; analyst-selected flow and operating assumptions. No pressure or capacity qualification.',
    inputs: { ...shared, flow, diameter },
  };
});
export function matchOperatingPreset(inputs) {
  return (
    OPERATING_PRESETS.find((p) =>
      Object.entries(p.inputs).every(([k, v]) => inputs[k] === v),
    ) || null
  );
}
