import { inspectorSections } from './inspectorSections.js';
import * as Cesium from 'cesium';
export function mountTexasPanel({
  viewer,
  layer,
  dataManager,
  referenceLayer,
}) {
  if (!layer) return () => {};
  const panel = document.createElement('section');
  panel.id = 'texas-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Texas statewide wells');
  panel.innerHTML = `<header><strong>TEXAS WELL DATABASE</strong><button data-hide aria-label="Hide Texas wells">✕</button></header><p data-status></p><label>Map display<select data-view-mode><option value="auto">Density overview / points close up</option><option value="density">Fixed-cell density</option><option value="locations">Locations / count clusters</option></select></label><label>Density cell size<select data-cell><option value="10">10 km × 10 km</option><option value="25" selected>25 km × 25 km</option><option value="50">50 km × 50 km</option></select></label><p>Fixed equal-area cells. Colors show inventory locations per km², not production. Edge cells include locations outside the map window.</p><div data-bin></div><button data-texas>View all Texas</button><label>RRC GIS classification<select data-category><option value="">All classifications</option></select></label><form data-search><label>Find Texas API-8 or API-10<input data-api placeholder="10300256" maxlength="10" inputmode="numeric"></label><button>Find well</button></form><p data-view role="status"></p><div data-detail></div><small>GIS locations may include permits, plugged wells and duplicate API locations. Source classification is not proof of current operation.</small>`;
  const sections = inspectorSections(panel, [
    panel.querySelector('[data-bin]'),
    panel.querySelector('[data-detail]'),
  ]);
  sections.show(null);
  document.body.append(panel);
  const text = (tag, value) => {
    const e = document.createElement(tag);
    e.textContent = value;
    return e;
  };
  const on = (selector, event, fn) =>
    panel.querySelector(selector).addEventListener(event, fn);
  on(
    '[data-hide]',
    'click',
    () => void dataManager.setEnabled('texas-wells', false, { origin: 'user' }),
  );
  on('[data-texas]', 'click', () => layer.flyTo());
  on('[data-category]', 'change', (e) => layer.setCategory(e.target.value));
  on('[data-search]', 'submit', (e) => {
    e.preventDefault();
    void layer.search(panel.querySelector('[data-api]').value.trim());
  });
  let populated = false,
    lastDetail,
    lastHistory,
    selectedLocation = null;
  for (const selector of ['[data-view-mode]', '[data-cell]'])
    panel
      .querySelector(selector)
      .addEventListener('change', () =>
        layer.setView(
          panel.querySelector('[data-view-mode]').value,
          panel.querySelector('[data-cell]').value,
        ),
      );
  function sync() {
    const s = layer.getState();
    panel.hidden = !dataManager.isEnabled('texas-wells');
    if (s.status) {
      const gis = s.status.datasets.find((d) => d.name === 'gis'),
        uic = s.status.datasets.find((d) => d.name === 'uic');
      panel.querySelector('[data-status]').textContent =
        `${Number(gis?.row_count ?? 0).toLocaleString()} GIS locations · ${Number(uic?.row_count ?? 0).toLocaleString()} UIC permits. Imported ${new Date(gis?.completed_at).toLocaleString()}.`;
      if (!populated) {
        for (const c of s.status.categories) {
          const o = text(
            'option',
            `${c.category} (${c.count.toLocaleString()})`,
          );
          o.value = c.category;
          panel.querySelector('[data-category]').append(o);
        }
        populated = true;
      }
    }
    panel.querySelector('[data-view-mode]').value = s.view;
    panel.querySelector('[data-cell]').value = String(s.cellKm);
    const bin = panel.querySelector('[data-bin]');
    bin.replaceChildren();
    if (s.bin) {
      bin.append(
        text(
          'strong',
          `${s.bin.count.toLocaleString()} locations · ${Number(s.bin.density).toFixed(2)} per km²`,
        ),
        text(
          'p',
          `Selected ${s.bin.cellKm} km equal-area cell. Show locations to inspect individual wells; dense views use count clusters.`,
        ),
      );
      const zoom = text('button', 'Show locations in this cell');
      zoom.onclick = () => {
        layer.zoomBin();
        layer.setView('locations', s.cellKm);
      };
      bin.append(zoom);
    }
    const viewHint =
      s.result?.mode === 'density'
        ? 'click a cell for its count and density'
        : s.result?.mode === 'clusters'
          ? 'click a cluster to zoom'
          : 'click a well for details';
    panel.querySelector('[data-view]').textContent =
      s.error ||
      (s.loading
        ? 'Loading visible area…'
        : s.result
          ? `${s.result.count.toLocaleString()} locations in view · ${viewHint}`
          : '');
    sections.show(
      s.bin
        ? `cell:${s.bin.x}:${s.bin.y}`
        : s.detail
          ? 'well:' + (selectedLocation || s.detail.matches[0]?.id)
          : null,
    );
    if (lastDetail === s.detail && lastHistory === s.history) return;
    lastDetail = s.detail;
    lastHistory = s.history;
    const box = panel.querySelector('[data-detail]');
    box.replaceChildren();
    if (!s.detail) return;
    const w =
      s.detail.matches.find((w) => w.id === selectedLocation) ||
      s.detail.matches[0];
    if (!w) {
      box.append(text('p', 'No matching well location.'));
      return;
    }
    box.append(
      text('h3', w.api8 ? `API-8 ${w.api8}` : `Unassigned API · GIS ${w.id}`),
      text('p', `${w.category} · well ${w.well_number || 'not recorded'}`),
      text(
        'p',
        `Location source: ${w.raw?.GIS_LOCATION_SOURCE || 'not recorded'}`,
      ),
    );
    if (s.detail.matches.length > 1) {
      const label = text('label', 'GIS location for this API'),
        select = document.createElement('select');
      for (const match of s.detail.matches)
        select.append(
          new Option(
            `${match.category} · well ${match.well_number || 'unknown'} · GIS ${match.id} · ${Number(match.latitude).toFixed(5)}, ${Number(match.longitude).toFixed(5)}`,
            match.id,
          ),
        );
      select.value = w.id;
      select.onchange = () => {
        selectedLocation = select.value;
        lastDetail = null;
        sync();
      };
      label.append(select);
      box.append(label);
    }
    box.append(
      text(
        'p',
        `GIS ${w.id} · ${Number(w.latitude).toFixed(5)}, ${Number(w.longitude).toFixed(5)} · source classification, not verified operating status`,
      ),
    );
    const zoom = text('button', 'Zoom to this well location');
    zoom.onclick = () =>
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          w.longitude,
          w.latitude,
          2000,
        ),
        duration: 1,
      });
    box.append(zoom);
    if (w.api8 && referenceLayer) {
      const b = text('button', 'Open downloaded RRC records');
      b.onclick = async () => {
        await dataManager.setEnabled('reference-records', true, {
          origin: 'user',
        });
        referenceLayer.openArchive(w.api8);
      };
      box.append(b);
    }
    box.append(
      text('p', `${s.detail.permits.length} UIC permits linked by API-8.`),
    );
    for (const p of s.detail.permits)
      box.append(
        text(
          'p',
          `UIC ${p.uic} · type ${p.injection_type} · ${p.raw.lease_name || ''} · operator #${p.raw.operator_number || 'not recorded'}`,
        ),
      );
    box.append(
      text(
        'small',
        'UIC types 1/2 are disposal; type 3 is secondary recovery. GIS symbols alone do not establish disposal membership.',
      ),
    );
    if (s.detail.permits.some((p) => [1, 2].includes(p.injection_type))) {
      const b = text('button', 'Load disposal history from RRC');
      b.onclick = () => void layer.loadHistory();
      b.disabled = Boolean(s.history?.loading);
      box.append(b);
    }
    if (s.history) {
      if (s.history.loading) box.append(text('p', 'Retrieving H-10 records…'));
      else if (s.history.error) box.append(text('p', s.history.error));
      else {
        box.append(
          text('p', s.history.warning || s.history.note),
          text(
            'p',
            `${s.history.rows?.length ?? 0} permit-month records · saved ${s.history.fetchedAt ? new Date(s.history.fetchedAt).toLocaleString() : 'not applicable'}`,
          ),
        );
        const latest = [...(s.history.rows || [])].sort((a, b) =>
          b.formatted_date.localeCompare(a.formatted_date),
        )[0];
        if (latest)
          box.append(
            text(
              'strong',
              `Latest reported month ${latest.formatted_date.slice(0, 7)} · UIC ${latest.uic_no} · ${latest.vol_liq == null ? 'Volume missing' : Number(latest.vol_liq).toLocaleString() + ' bbl'} · ${Number(latest.inj_press_avg) > 0 ? latest.inj_press_avg + ' psi average' : 'Pressure unreported / ambiguous'}`,
            ),
          );
        const historyDetails = document.createElement('details');
        historyDetails.append(text('summary', 'All permit-month observations'));
        const wrap = document.createElement('div');
        wrap.className = 'injection-table-scroll';
        const table = document.createElement('table');
        const header = document.createElement('tr');
        for (const label of ['UIC', 'Month', 'bbl', 'Avg psi'])
          header.append(text('th', label));
        table.append(header);
        for (const r of [...(s.history.rows ?? [])].sort((a, b) =>
          b.formatted_date.localeCompare(a.formatted_date),
        )) {
          const tr = document.createElement('tr');
          for (const v of [
            r.uic_no,
            r.formatted_date.slice(0, 7),
            r.vol_liq ?? 'Missing',
            Number(r.inj_press_avg) > 0
              ? r.inj_press_avg
              : 'Unreported / ambiguous',
          ])
            tr.append(text('td', v));
          table.append(tr);
        }
        wrap.append(table);
        historyDetails.append(wrap);
        box.append(historyDetails);
      }
    }
  }
  const unsub = layer.subscribe(sync),
    activity = dataManager.subscribeActivity(sync);
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((e) => {
    if (document.body.dataset.locationPicking) return;
    if (!dataManager.isEnabled('texas-wells')) return;
    const id = viewer.scene.pick(e.position)?.id?.id;
    if (typeof id === 'string' && id.startsWith('texas:')) layer.pick(id);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  sync();
  return () => {
    unsub();
    activity();
    handler.destroy();
    panel.remove();
  };
}
