import { inspectorSections } from './inspectorSections.js';
import { etSelection, readableFacts } from './featureFacts.js';
import * as Cesium from 'cesium';
import { REFERENCE_COLORS } from './records.js';
const node = (tag, text) => {
  const e = document.createElement(tag);
  if (text != null) e.textContent = String(text);
  return e;
};
const human = (s) => s.replace(/_/g, ' ');
function properties(data) {
  const dl = node('dl');
  dl.className = 'record-properties';
  for (const [key, value] of Object.entries(data || {})) {
    if (value === null || value === '' || typeof value === 'object') continue;
    dl.append(node('dt', human(key)), node('dd', value));
  }
  return dl;
}
export function mountReferenceRecordsPanel({ viewer, dataManager, layer }) {
  const panel = node('section');
  panel.id = 'records-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Reference data explorer');
  panel.innerHTML = `<header><strong>WELLS, WATER & ENVIRONMENT</strong><button data-hide aria-label="Hide reference data explorer">✕</button></header>
 <details data-layers><summary>Visible map layers</summary><div data-toggles></div></details>
 <div data-legend></div><label>Inspect collection<select data-dataset aria-label="Reference collection"></select></label>
 <p data-status></p><p data-note></p><div data-map-controls><button data-fit>Zoom to coverage</button><label data-injection-label>Injection map<select data-injection aria-label="Injection map"><option value="points">Well locations</option><option value="capacity">Permitted capacity heat map · bbl/day</option><option value="volume">Annual reported injection heat map · bbl/year</option></select></label><p data-injection-note></p><label data-period-label>Reporting period<select data-period></select></label><label data-measurement-label>Measurement<select data-measurement><option value="ET">Actual ET · mm/month</option><option value="ETo">Reference ETo · mm/month</option></select></label><p data-et-legend>ET / ETo: pale blue 0 → dark blue 300 mm/month (capped). Gray = no observation; zero is a measured value.</p></div>
 <p data-view role="status"></p><form data-search><label>RRC record type<select data-kind><option value="">All API-linked records</option></select></label><label>Texas API-8<input data-api placeholder="10300256" pattern="[0-9]{8}"></label><label>Or source lease / gas-well / operator ID<input data-key placeholder="Preserve source leading zeros"></label><button>Search downloaded RRC records</button></form>
 <div data-detail></div><footer><small>Source snapshots • click a marker for records; click clusters to zoom.</small></footer>`;
  const sections = inspectorSections(panel, [
    panel.querySelector('[data-detail]'),
  ]);
  sections.show(null);
  document.body.append(panel);
  const abort = new AbortController(),
    on = (selector, event, fn) =>
      panel
        .querySelector(selector)
        .addEventListener(event, fn, { signal: abort.signal });
  const kinds = [
    'operator',
    'plug_action',
    'iwar_record',
    'iwar_well',
    'permian_current_well_status',
    'permian_operator_county_year',
    'w10_test',
    'g10_test',
    'annual_legal_operator_ranking',
    'ewa_exxon_family_candidate',
    'ewa_operator_snapshot',
    'well_location',
  ];
  for (const k of kinds)
    panel.querySelector('[data-kind]').append(new Option(human(k), k));
  on(
    '[data-hide]',
    'click',
    () =>
      void dataManager.setEnabled('reference-records', false, {
        origin: 'user',
      }),
  );
  on('[data-dataset]', 'change', (e) => void layer.showDataset(e.target.value));
  on('[data-fit]', 'click', () => layer.flyTo());
  on('[data-injection]', 'change', (e) => layer.setDisplay(e.target.value));
  on('[data-period]', 'change', (e) => layer.setPeriod(e.target.value));
  on('[data-measurement]', 'change', (e) =>
    layer.setMeasurement(e.target.value),
  );
  on('[data-search]', 'submit', (e) => {
    e.preventDefault();
    void layer.searchArchive({
      kind: panel.querySelector('[data-kind]').value,
      api: panel.querySelector('[data-api]').value.trim(),
      key: panel.querySelector('[data-key]').value.trim(),
    });
  });
  let catalogRef,
    lastSelected,
    lastDetail,
    lastArchive,
    lastPeriod,
    lastMeasurement;
  function sync() {
    const s = layer.getState();
    panel.hidden = !s.enabled;
    if (!s.enabled) return;
    if (catalogRef !== s.metadata) {
      catalogRef = s.metadata;
      panel
        .querySelector('[data-dataset]')
        .replaceChildren(...s.metadata.map((d) => new Option(d.name, d.id)));
      const toggles = panel.querySelector('[data-toggles]');
      toggles.replaceChildren();
      for (const d of s.metadata.filter((d) => d.feature_count > 0)) {
        const label = node('label'),
          input = node('input');
        input.type = 'checkbox';
        input.dataset.layer = d.id;
        input.addEventListener(
          'change',
          () => void layer.toggle(d.id, input.checked),
          { signal: abort.signal },
        );
        label.append(input, node('span', d.name));
        toggles.append(label);
      }
    }
    for (const input of panel.querySelectorAll('[data-layer]'))
      input.checked = s.active.includes(input.dataset.layer);
    const legend = panel.querySelector('[data-legend]');
    legend.replaceChildren(
      ...s.active.map((id) => {
        const tag = node(
          'span',
          s.metadata.find((d) => d.id === id)?.name || id,
        );
        tag.style.borderLeft =
          '5px solid ' + (REFERENCE_COLORS[id] || '#6ecdd4');
        return tag;
      }),
    );
    panel.querySelector('[data-dataset]').value = s.selected;
    const d = s.metadata.find((d) => d.id === s.selected);
    if (!d) return;
    panel.querySelector('[data-status]').textContent =
      s.selected === 'rrc-records'
        ? `${Number(d.observation_count).toLocaleString()} searchable source rows · imported ${new Date(d.imported_at).toLocaleDateString()}`
        : `${Number(d.feature_count).toLocaleString()} feature records · ${Number(d.located_count).toLocaleString()} located · ${Number(d.observation_count).toLocaleString()} linked history rows · imported ${new Date(d.imported_at).toLocaleDateString()}`;
    panel.querySelector('[data-note]').textContent = d.note;
    const isArchive = s.selected === 'rrc-records',
      et = s.selected === 'openet';
    const injection = s.selected === 'texnet-injection';
    panel.querySelector('[data-injection-label]').hidden = !injection;
    panel.querySelector('[data-injection-note]').hidden = !injection;
    panel.querySelector('[data-injection]').value = s.display;
    panel.querySelector('[data-injection-note]').textContent =
      'Heat maps sum source values in fixed 5 × 5 km equal-area cells. Capacity is the permit snapshot, not available capacity; zero/absent limits are unknown. Annual totals are reported rows, may be partial or overlapping, and are not verified complete-year totals. Gray means no usable value; missing wells are excluded from sums. Select a year for volume.';
    panel.querySelector('[data-map-controls]').hidden = isArchive;
    panel.querySelector('[data-search]').hidden = !isArchive;
    panel.querySelector('[data-measurement-label]').hidden = !et;
    panel.querySelector('[data-et-legend]').hidden = !et;
    panel.querySelector('[data-period-label]').hidden =
      !d.periods?.length || (injection && s.display === 'capacity');
    if (lastSelected !== s.selected + s.display) {
      lastSelected = s.selected + s.display;
      panel
        .querySelector('[data-period]')
        .replaceChildren(
          ...(injection && s.display === 'volume'
            ? []
            : [new Option('All periods', '')]),
          ...(d.periods || []).map((p) => new Option(p, p)),
        );
    }
    panel.querySelector('[data-period]').value = s.period;
    panel.querySelector('[data-measurement]').value = s.measurement;
    const result = s.results.get(s.selected);
    const hint =
      result?.mode === 'injection-heat'
        ? 'fixed 5 km cells · click a cell for totals and missing values'
        : result?.mode === 'clusters'
          ? 'clustered; zoom for individual records'
          : et
            ? 'click a field polygon'
            : 'click a marker';
    panel.querySelector('[data-view]').textContent =
      s.error ||
      (s.loading.includes(s.selected)
        ? 'Loading visible area…'
        : result
          ? `${result.count.toLocaleString()} in view · ${hint}`
          : '');
    if (
      lastDetail === s.detail &&
      lastArchive === s.archive &&
      lastPeriod === s.period &&
      lastMeasurement === s.measurement
    )
      return;
    lastPeriod = s.period;
    lastMeasurement = s.measurement;
    lastDetail = s.detail;
    lastArchive = s.archive;
    const box = panel.querySelector('[data-detail]');
    box.replaceChildren();
    sections.show(s.detail || s.archive ? s.detail?.key || 'records' : null);
    if (s.detail) {
      const d = s.detail;
      if (d.heat) {
        const f = d.heat,
          units = d.metric === 'capacity' ? 'bbl/day' : 'bbl/year';
        box.append(
          node(
            'h3',
            d.metric === 'capacity'
              ? 'Permitted injection capacity · snapshot'
              : 'Reported injection · ' + d.period,
          ),
          node(
            'strong',
            f.value == null
              ? 'No usable source value'
              : Number(f.value).toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                }) +
                  ' ' +
                  units,
          ),
          node(
            'p',
            `5 × 5 km cell · ${f.known} wells with values · ${f.missing} without usable values · ${f.count} mapped wells`,
          ),
          node(
            'p',
            'TexNet local reporting subset. Cell totals include full edge cells. Capacity is not spare capacity. Annual reported rows may be incomplete or overlap; missing is not zero. See Layer settings to switch maps or years.',
          ),
        );
        return;
      }
      if (d.loading) {
        box.append(node('p', 'Loading records…'));
        return;
      }
      if (d.error) {
        box.append(node('p', d.error));
        return;
      }
      box.append(node('h3', d.feature?.name || 'Record unavailable'));
      if (d.dataset === 'openet') {
        const selected = etSelection(
          d.observations || [],
          s.period,
          s.measurement,
        );
        box.append(node('p', `Field ${d.key} · OpenET historical sample`));
        const measure = s.measurement === 'ETo' ? 'reference ETo' : 'actual ET';
        const headline = node(
          'strong',
          !s.period
            ? 'Choose a reporting month to inspect its map value'
            : selected.value === null
              ? `No observation · ${measure} · ${s.period}`
              : `${selected.value.toFixed(1)} mm ${measure} · ${s.period}`,
        );
        headline.className = 'lm-key-fact';
        box.append(headline);
        const controls = node('div');
        controls.className = 'lm-fact-controls';
        for (const [labelText, current, choices, change] of [
          [
            'Selected month',
            s.period,
            (s.metadata.find((m) => m.id === 'openet')?.periods || []).map(
              (p) => [p, p],
            ),
            (v) => layer.setPeriod(v),
          ],
          [
            'Selected measure',
            s.measurement,
            [
              ['ET', 'Actual ET'],
              ['ETo', 'Reference ETo'],
            ],
            (v) => layer.setMeasurement(v),
          ],
        ]) {
          const label = node('label', labelText),
            select = node('select');
          if (labelText === 'Selected month')
            select.append(new Option('Choose month', ''));
          for (const [value, text] of choices)
            select.append(new Option(text, value));
          select.value = current;
          select.addEventListener('change', () => change(select.value));
          label.append(select);
          controls.append(label);
        }
        box.append(controls);
        const dl = node('dl');
        dl.className = 'record-properties';
        for (const [label, value] of readableFacts(d.feature?.properties))
          dl.append(node('dt', label), node('dd', value));
        box.append(dl);
        const history = node('details');
        history.open = true;
        history.append(
          node('summary', `${measure} monthly history · mm/month`),
        );
        const table = node('table');
        table.className = 'lm-history-table';
        const head = node('tr');
        head.append(
          node('th', 'Month'),
          node('th', 'mm/month'),
          node('th', '0–300 mm scale'),
        );
        table.append(head);
        for (const row of selected.history) {
          const tr = node('tr');
          if (row.period === s.period) tr.className = 'lm-current-observation';
          const value = row.value == null ? null : Number(row.value);
          tr.append(
            node('td', row.period),
            node('td', Number.isFinite(value) ? value.toFixed(1) : 'Missing'),
          );
          const td = node('td');
          if (Number.isFinite(value)) {
            const meter = node('meter');
            meter.min = 0;
            meter.max = 300;
            meter.value = value;
            meter.setAttribute('aria-label', `${row.period}: ${value} mm`);
            td.append(meter);
          }
          tr.append(td);
          table.append(tr);
        }
        history.append(table);
        box.append(history);
      } else {
        const dl = node('dl');
        dl.className = 'record-properties';
        for (const [label, value] of readableFacts(d.feature?.properties))
          dl.append(node('dt', label), node('dd', value));
        box.append(
          node(
            'p',
            `Source record ${d.key}${s.period ? ' · map period ' + s.period : ''}`,
          ),
          dl,
        );
        if (d.feature?.api8)
          box.append(node('p', 'Texas API-8 · ' + d.feature.api8));
      }
      box.append(
        node(
          'p',
          d.note ||
            'Source snapshot; see original records for evidence and coverage.',
        ),
      );
      const raw = node('details');
      raw.append(
        node('summary', 'Source fields & original observations'),
        properties(d.feature?.properties),
      );
      for (const r of d.observations || []) {
        const entry = node('details');
        entry.append(
          node('summary', [r.period, r.kind].filter(Boolean).join(' · ')),
          properties(r.raw),
        );
        raw.append(entry);
      }
      if (d.total)
        pagination(
          raw,
          d.offset,
          d.total,
          100,
          (offset) => void layer.loadDetail(d.dataset, d.key, offset),
        );
      box.append(raw);
      sections.show(d.key);
    }
    if (s.archive) {
      const a = s.archive;
      if (a.loading) {
        box.append(node('p', 'Searching downloaded records…'));
        return;
      }
      if (a.error) {
        box.append(node('p', a.error));
        return;
      }
      panel.querySelector('[data-api]').value = a.filters.api || '';
      panel.querySelector('[data-key]').value = a.filters.key || '';
      panel.querySelector('[data-kind]').value = a.filters.kind || '';
      box.append(
        node('p', `${a.total.toLocaleString()} matching records`),
        node('small', a.note),
      );
      for (const r of a.rows) {
        const entry = node('details');
        entry.append(
          node(
            'summary',
            `${human(r.kind)} · ${r.api8 || r.join_key || 'source record'}`,
          ),
          properties(r.raw),
        );
        box.append(entry);
      }
      pagination(
        box,
        a.offset,
        a.total,
        50,
        (offset) => void layer.searchArchive({ ...a.filters, offset }),
      );
    }
  }
  function pagination(box, offset, total, size, load) {
    const row = node('div');
    row.append(
      node(
        'small',
        `${total ? offset + 1 : 0}–${Math.min(offset + size, total)} of ${total.toLocaleString()}`,
      ),
    );
    if (offset) {
      const b = node('button', 'Previous');
      b.onclick = () => load(Math.max(0, offset - size));
      row.append(b);
    }
    if (offset + size < total) {
      const b = node('button', 'Next records');
      b.onclick = () => load(offset + size);
      row.append(b);
    }
    box.append(row);
  }
  const unsubscribe = layer.subscribe(sync),
    handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((e) => {
    if (document.body.dataset.locationPicking) return;
    if (!layer.getState().enabled) return;
    const id = viewer.scene.pick(e.position)?.id?.id;
    if (typeof id === 'string' && id.startsWith('reference:'))
      void layer.pick(id);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  sync();
  return () => {
    abort.abort();
    unsubscribe();
    handler.destroy();
    panel.remove();
  };
}
