import { themeLegend } from './landThemes.js';
import { DENSITY_SCALE } from './densityModel.js';
import { LANDMAN_LAYERS } from './landmanModel.js';
import { REFERENCE_COLORS } from './records.js';
import { assetSymbol, ET_COLORS } from './mapSymbols.js';
const node = (tag, text) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  return el;
};
export function mountMapLegend({ root, catalog, enabled, inspect }) {
  const panel = node('details');
  panel.className = 'lm-map-legend';
  panel.open = true;
  const summary = node('summary', 'On this map');
  const body = node('div');
  panel.append(summary, body);
  root.append(panel);
  let signature = '';
  function render() {
    const active = LANDMAN_LAYERS.filter(enabled);
    const records = catalog.get('reference-records');
    const recordState = records.getState();
    const entries = active.map((item) => {
      const state = item.dataset
        ? recordState
        : catalog.get(item.id).getState?.() || {};
      const result = item.dataset
        ? recordState.results.get(item.id)
        : state.result;
      const filters = item.dataset ? records.getFilters(item.id) : {};
      return { item, state, result, filters };
    });
    // Preserve controls and focus when notifications do not change legend content.
    const next = JSON.stringify(
      entries.map(({ item, state, result, filters }) => [
        item.id,
        result?.mode,
        result?.count,
        result?.cellKm,
        state.theme,
        filters,
        state.error,
        state.loading,
        state.coverage,
        state.direction,
        state.mapPeriod,
        state.variantId,
        state.reference,
        state.range,
        state.opacity,
        state.periodManifest,
      ]),
    );
    if (next === signature) return;
    signature = next;
    summary.textContent = `On this map · ${active.length} ${active.length === 1 ? 'layer' : 'layers'}`;
    body.replaceChildren();
    if (!active.length) body.append(node('p', 'Choose a layer to explore.'));
    for (const { item, state, result, filters } of entries) {
      const row = node('section');
      const heading = node('button', item.name + ' · Details');
      heading.addEventListener('click', () => inspect(item));
      const icon = node('img');
      icon.alt = '';
      icon.src = assetSymbol(item.id, REFERENCE_COLORS[item.id] || item.color);
      heading.prepend(icon);
      row.append(heading, node('small', item.source));
      if (filters.period && item.id !== 'openet')
        row.append(node('small', 'Reporting period: ' + filters.period));
      let description =
        'Individual asset symbols · sizes do not represent capacity';
      if (result?.mode === 'clusters') {
        icon.src = assetSymbol(
          'cluster',
          item.id === 'texas-wells'
            ? '#4eada2'
            : REFERENCE_COLORS[item.id] || item.color,
        );
        description =
          'Count clusters · larger circles = more records. Click to zoom. Not density or production.';
      } else if (item.id === 'texas-wells') {
        icon.src = assetSymbol('well', '#f5c976');
        description =
          'Individual well locations · includes source classifications, not verified activity';
      }
      if (result?.mode === 'density') {
        icon.hidden = true;
        description = `${result.cellKm} km × ${result.cellKm} km fixed equal-area cells · RRC locations/km². Full edge cells extend beyond view; not active production.`;
        for (const step of DENSITY_SCALE) {
          const label = node('small', '■ ' + step.label + ' locations/km²');
          label.style.color = step.color;
          row.append(label);
        }
        const controls = node('button', 'Change density display / cell size');
        controls.addEventListener('click', () => inspect(item));
        row.append(controls);
      }
      if (item.id === 'us-basins') {
        icon.hidden = true;
        description =
          'Gray boundaries · USGS geological context; not property or formation limits';
      }
      if (item.id === 'land-parcels') {
        icon.hidden = true;
        description =
          result?.mode === 'clusters'
            ? 'Parcel-count clusters. Zoom in for owner themes; count is not owner identity.'
            : 'Appraisal parcels · ' +
              ({
                neutral: 'boundaries',
                class: 'owner class',
                research: 'research status',
              }[state.theme] || 'boundaries') +
              ' · not verified mineral rights';
        if (result?.mode === 'parcels') {
          for (const [label, color] of themeLegend(state.theme)) {
            const key = node('small', '■ ' + label);
            key.style.color = color;
            row.append(key);
          }
          if (state.theme !== 'neutral')
            row.append(
              node(
                'small',
                'Dashed: missing name or candidate class. Unknown parcels are separate research items.',
              ),
            );
        }
      }
      if (item.id === 'openet') {
        icon.hidden = true;
        description = `${filters.kind || 'ET'} · ${filters.period || 'No month selected'} · 42 Lubbock fields, 2018 only. Gray = no observation.`;
        const ramp = node('div');
        ramp.className = 'lm-legend-ramp lm-et-ramp';
        ramp.style.background = `linear-gradient(90deg,${ET_COLORS.map((color, i) => `${color} ${i * 20}%,${color} ${(i + 1) * 20}%`).join(',')})`;
        const missing = node('small', '■ No observation');
        missing.style.color = '#969696';
        row.append(missing);
        row.append(
          ramp,
          node('small', '0 · 60 · 120 · 180 · 240–300+ mm/month'),
        );
      }
      if (item.id === 'terrain-difference' || item.id === 'ground-motion') {
        icon.hidden = true;
        if (item.id === 'terrain-difference') {
          description = state.reference
            ? `Terrain relative to A (${state.reference.latitude?.toFixed(4)}, ${state.reference.longitude?.toFixed(4)}) · metres. Blue = lower; orange = higher.`
            : 'Choose reference point A in Compare locations to show terrain shading.';
          if (state.reference) addRamp(row, state.range, 'm');
        } else {
          const period =
            {
              month: '1 month',
              year: '1 year',
              five: '5 years',
              ten: '10 years',
            }[state.mapPeriod] || state.mapPeriod;
          description =
            state.coverage === 'permian'
              ? `LOS change · ${period} · Crane/Tubbs and Toyah pilot footprints, ending Dec 2025`
              : state.coverage === 'us'
                ? `Long-term LOS velocity · ${state.direction || 'ascending'} orbit · dates vary by frame`
                : 'Crane archive · 2016-08-01 to 2025-12-30 · LOS velocity';
          if (state.coverage !== 'crane' || state.reference)
            addRamp(
              row,
              state.coverage === 'permian' ? 100 : 30,
              state.coverage === 'permian' ? 'mm' : 'mm/year',
            );
          row.append(
            node(
              'small',
              state.reference && state.coverage === 'crane'
                ? 'Colors relative to selected movement reference rate; see Details.'
                : 'Negative = away; positive = toward satellite. Not vertical subsidence.',
            ),
          );
          row.append(
            node(
              'small',
              'Transparent = no valid observation; not zero. One terrain/movement shading layer at a time.',
            ),
          );
          const label = node('label', 'Map opacity ');
          const slider = node('input');
          slider.type = 'range';
          slider.min = '0';
          slider.max = '1';
          slider.step = '.05';
          slider.value = state.opacity ?? 0.7;
          slider.setAttribute('aria-label', 'Ground movement map opacity');
          slider.addEventListener('change', () =>
            catalog.get(item.id).setOpacity(Number(slider.value)),
          );
          label.append(slider);
          row.append(label);
        }
      }
      row.append(node('p', description));
      if (result)
        row.append(
          node(
            'small',
            `${Number(result.count || 0).toLocaleString()} records in view`,
          ),
        );
      if (state.error) row.append(node('p', 'Data warning: ' + state.error));
      body.append(row);
    }
  }
  const off = ['ground-motion', 'terrain-difference', 'land-parcels'].map(
    (id) => catalog.get(id).subscribe(render),
  );
  render();
  return {
    render,
    destroy() {
      off.forEach((fn) => fn());
      panel.remove();
    },
  };
}
function addRamp(row, range, units) {
  const ramp = node('div');
  ramp.className = 'lm-legend-ramp';
  row.append(
    ramp,
    node('small', `−${range} · 0 · +${range} ${units} · colors saturate`),
  );
}
