import * as Cesium from 'cesium';
import {injectionAt, injectionMonthSummary} from './injectionModel.js';
export function mountInjectionPanel({viewer, dataManager, layer}) {
  if (!layer) return () => {};
  const panel = document.createElement('section'); panel.id = 'injection-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Disposal wells and injection history');
  panel.innerHTML = `<header><strong>DISPOSAL & INJECTION</strong><button data-hide aria-label="Hide disposal wells">✕</button></header><small>Texas RRC · historical local archive</small><label>Reporting month<input type="month" data-month></label><p data-total></p><small>● Teal: volume &nbsp; ● Cream: archived zero<br>● Gray: no record for selected month</small><label>Find a well<select data-well><option value="">Select on map or choose an API-8…</option></select></label><div data-details></div><p class="ref-note">Records are delayed. Missing months are not zero. Status and locations are historical. Spatial overlap does not establish causation.</p>`;
  document.body.append(panel);
  const on = (selector, type, fn) => panel.querySelector(selector).addEventListener(type, fn);
  const format = value => value == null ? 'Not reported' : value.toLocaleString('en-US', {maximumFractionDigits: 1});
  const make = (tag, text) => {const e = document.createElement(tag); e.textContent = text; return e;};
  let populated = false, lastSelection = '';
  on('[data-hide]', 'click', () => void dataManager.setEnabled('injection-wells', false, {origin: 'user'}));
  on('[data-month]', 'change', event => layer.setMonth(event.target.value));
  on('[data-well]', 'change', event => layer.select(event.target.value));
  function sync() {
    const state = layer.getState(); panel.hidden = !dataManager.isEnabled('injection-wells');
    if (!state.data) return;
    const {data, month, selectedId} = state;
    const input = panel.querySelector('[data-month]'); input.min = data.period[0]; input.max = data.period[1]; input.value = month;
    if (!populated) {
      for (const well of data.wells) {const option = make('option', `${well.api8} · ${well.history.length ? 'history available' : 'no history'}`); option.value = well.id; panel.querySelector('[data-well]').append(option);} populated = true;
    }
    const total = injectionMonthSummary(data.wells, month);
    panel.querySelector('[data-total]').textContent = `${month}: ${format(total.bbl)} bbl across ${total.reportingWells}/${data.wellCount} wells with records. Subset total, not regional production.`;
    panel.querySelector('[data-well]').value = selectedId ?? '';
    if (lastSelection === `${selectedId}:${month}`) return; lastSelection = `${selectedId}:${month}`;
    const detail = panel.querySelector('[data-details]'); detail.replaceChildren();
    const well = data.wells.find(item => item.id === selectedId); if (!well) {detail.append(make('p', 'Click a well marker to inspect its permits and monthly history.')); return;}
    const row = injectionAt(well, month);
    detail.append(make('h3', `API-8 ${well.api8}`), make('p', `UIC: ${well.uics.join(', ')} · ${well.permitType === 1 ? 'W-14' : 'H-1'} disposal`),
      make('p', `Archive flags: ${well.plugged ? 'plugged' : 'no plugged flag'}; ${well.canceled ? 'canceled' : 'no canceled flag'}. These do not prove current operation.`),
      make('p', `Interval: ${format(well.topFt)}–${format(well.bottomFt)} ft · ${well.zone} interpretation (${well.zoneRule}).`),
      make('p', row ? `${month}: ${format(row.bbl)} bbl · average ${format(row.avgPsi)} psi · maximum ${format(row.maxPsi)} psi` : `${month}: no record. This is not zero injection.`));
    if (well.history.length) {
      detail.append(make('p', `${well.history.length} archived months · ${well.history[0].month} → ${well.history.at(-1).month}`));
      const history = document.createElement('details'); history.append(make('summary', 'Monthly volume and pressure history'));
      const wrap = document.createElement('div'); wrap.className = 'injection-table-scroll';
      const table = document.createElement('table'); const head = document.createElement('tr'); for (const label of ['Month', 'bbl', 'Avg psi', 'Max psi']) head.append(make('th', label)); table.append(head);
      for (const r of [...well.history].reverse()) {const tr = document.createElement('tr'); for (const v of [r.month, format(r.bbl), format(r.avgPsi), format(r.maxPsi)]) tr.append(make('td', v)); table.append(tr);} wrap.append(table); history.append(wrap); detail.append(history);
    } else detail.append(make('p', 'No monthly history in this archive.'));
    detail.append(make('small', `Join ID ${well.id} is synthetic; completion suffix 0000 is not verified. Archived zero volumes may include original blanks converted upstream.`));
  }
  const unsubscribe = layer.subscribe(sync), unactivity = dataManager.subscribeActivity(sync);
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction(event => {if (!dataManager.isEnabled('injection-wells')) return; const id = viewer.scene.pick(event.position)?.id?.id; if (typeof id === 'string' && id.startsWith('injection:')) layer.select(id.slice(10));}, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  sync(); return () => {unsubscribe(); unactivity(); handler.destroy(); panel.remove();};
}
