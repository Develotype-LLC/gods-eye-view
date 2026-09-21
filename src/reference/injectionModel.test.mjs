import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInjection, injectionAt, injectionMonthSummary} from './injectionModel.js';
const well = {id:'42103002560000', longitude:-102.6, latitude:31.4, history:[{month:'2020-01',bbl:0},{month:'2020-03',bbl:100}]};
test('missing months stay missing; zero records count without fabricating gap volumes', () => {
  assert.equal(injectionAt(well,'2020-02'),null);
  assert.equal(injectionAt(well,'2020-01').bbl,0);
  assert.deepEqual(injectionMonthSummary([well],'2020-02'),{reportingWells:0,bbl:0});
  assert.deepEqual(injectionMonthSummary([well],'2020-01'),{reportingWells:1,bbl:0});
});
test('rejects duplicate wells, monthly rows, invalid coordinates and negative volumes', () => {
  const data = {schemaVersion:1,wells:[well]}; assert.equal(validateInjection(data),data);
  assert.throws(() => validateInjection({...data,wells:[well,well]}));
  for (const patch of [{longitude:NaN},{history:[well.history[0],well.history[0]]},{history:[{month:'2020-01',bbl:-1}]}]) assert.throws(() => validateInjection({...data,wells:[{...well,...patch}]}));
});
