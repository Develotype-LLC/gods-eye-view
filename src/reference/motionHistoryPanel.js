import { historyWindow } from './motionHistory.js';

export function mountMotionHistoryPanel(legend, layer) {
  const panel = document.createElement('div');
  panel.className = 'motion-history';
  panel.innerHTML = `<label>Map view<select data-coverage><option value="us">US · long-term velocity</option><option value="permian">Permian pilot · dated change maps</option><option value="crane">Crane County · local archive</option></select></label>
  <div data-period-map hidden><strong>Map overlay · measured change</strong><label>Map change period<select data-map-period><option value="month">1 month</option><option value="year" selected>1 year</option><option value="five">5 years</option><option value="ten" disabled>10 years · insufficient history</option></select></label><div class="motion-regions"><button data-period-area>Both areas</button><button data-pilot="validation_b">Crane / Tubbs</button><button data-pilot="validation_c">Toyah</button></div><p data-map-dates></p><p>Crane / Tubbs Corner and Toyah archive footprints only—not the whole Permian. These maps end in December 2025. Changing this period updates the overlay.</p><p>Colors show end-minus-start displacement in mm, with a fixed ±100 mm scale. Transparent areas have no valid endpoint pair. Click a pixel for its value and exact dates.</p></div>
  <div data-national><div class="motion-map-summary"><strong>Map overlay · long-term velocity</strong><p>Colors show mm/year across the available record. For dated overlays, switch to the Permian pilot below.</p><button data-open-period-map>Show Permian change maps</button></div><div class="motion-regions"><button type="button" data-region="us">Lower 48</button><button type="button" data-region="alaska">Alaska</button><button type="button" data-region="hawaii">Hawaii</button></div><p>US coverage where NASA has valid observations, including Alaska and Hawaii. The map shows <strong>long-term velocity</strong>; the period below changes the selected point's history.</p>
  <label>Satellite orbit<select data-orbit><option value="ascending">Ascending</option><option value="descending">Descending</option></select></label>
  <h3 class="motion-section-title">Selected point history</h3><p class="motion-period-note">The period changes this point’s chart and value only. It does not change the map colors.</p>
  <label>Point-history period<select data-period><option value="month">1 month</option><option value="year" selected>1 year</option><option value="five">5 years</option><option value="ten">10 years</option><option value="all">All available</option></select></label>
  <label data-frame-label hidden>Observation frame<select data-frame></select></label>
  <p data-history-status role="status">Select a location. End date follows its latest available observation.</p><div data-history-result></div>
  <small>Short-wavelength line-of-sight displacement. Positive: toward satellite; negative: away. Not vertical subsidence. No data is not zero movement. Period selections do not recolor the national overview.</small></div>`;
  legend.insertBefore(
    panel,
    legend.querySelector('[data-variant]').parentElement,
  );
  const abort = new AbortController();
  let request,
    data,
    selectedPoint,
    intent = 0;
  const on = (selector, event, fn) =>
    panel
      .querySelector(selector)
      .addEventListener(event, fn, { signal: abort.signal });
  const status = panel.querySelector('[data-history-status]'),
    result = panel.querySelector('[data-history-result]');
  const text = (tag, value) => {
    const n = document.createElement(tag);
    n.textContent = value;
    return n;
  };
  function draw() {
    result.replaceChildren();
    if (!data) return;
    const series = data.series.find(
      (s) => s.frame === panel.querySelector('[data-frame]').value,
    );
    if (!series) {
      status.textContent =
        'No valid history returned here. Try the other orbit or another location.';
      return;
    }
    const value = historyWindow(
      series.points,
      panel.querySelector('[data-period]').value,
    );
    status.textContent = `${data.latitude.toFixed(5)}, ${data.longitude.toFixed(5)} · ${series.frame} · ${data.direction}`;
    if (value.error) {
      result.append(text('p', value.error));
      return;
    }
    result.append(
      text(
        'h3',
        `${value.changeMm >= 0 ? '+' : ''}${value.changeMm.toFixed(1)} mm LOS`,
      ),
      text(
        'p',
        `${value.start.slice(0, 10)} → ${value.end.slice(0, 10)} · ${Math.round(value.days)} days`,
      ),
    );
    const width = 300,
      height = 170,
      ys = value.points.map((p) => p.relativeMm),
      min = Math.min(0, ...ys),
      span = Math.max(1, Math.max(0, ...ys) - min),
      t0 = Date.parse(value.start),
      dt = Math.max(1, Date.parse(value.end) - t0);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      'Displacement observations relative to the first date in the selected period',
    );
    const label = (x, y, value) => {
      const t = document.createElementNS(svg.namespaceURI, 'text');
      t.setAttribute('x', x);
      t.setAttribute('y', y);
      t.setAttribute('fill', 'currentColor');
      t.setAttribute('font-size', '10');
      t.textContent = value;
      svg.append(t);
    };
    const zero = document.createElementNS(svg.namespaceURI, 'line');
    zero.setAttribute('x1', '40');
    zero.setAttribute('x2', '290');
    zero.setAttribute('y1', String(125 - ((0 - min) / span) * 105));
    zero.setAttribute('y2', zero.getAttribute('y1'));
    zero.setAttribute('stroke', '#b8cbc6');
    zero.setAttribute('stroke-dasharray', '3 3');
    svg.append(zero);
    label('0', '12', 'LOS mm');
    label('0', '24', (min + span).toFixed(1));
    label('0', '125', min.toFixed(1));
    label('40', '148', value.start.slice(0, 10));
    label('226', '148', value.end.slice(0, 10));
    label('120', '165', 'Observation date');
    for (const p of value.points) {
      const dot = document.createElementNS(svg.namespaceURI, 'circle');
      dot.setAttribute(
        'cx',
        String(40 + ((Date.parse(p.date) - t0) / dt) * 250),
      );
      dot.setAttribute('cy', String(125 - ((p.relativeMm - min) / span) * 105));
      dot.setAttribute('r', '2.5');
      dot.setAttribute('fill', '#77d1c4');
      const title = document.createElementNS(svg.namespaceURI, 'title');
      title.textContent = `${p.date.slice(0, 10)}: ${p.relativeMm.toFixed(2)} mm`;
      dot.append(title);
      svg.append(dot);
    }
    result.append(
      svg,
      text(
        'small',
        `Relative range ${min.toFixed(1)} to ${Math.max(0, ...ys).toFixed(1)} mm · ${value.points.length} valid observations · largest gap ${Math.round(value.maxGapDays)} days. Start-date offset ${Math.round(value.startOffsetDays)} days.`,
      ),
    );
    if (value.points.some((p) => !p.qualityReported))
      result.append(
        text(
          'p',
          'ASF did not supply per-observation quality flags for some values. Treat this as an exploratory comparison.',
        ),
      );
    const details = document.createElement('details');
    details.append(text('summary', 'Observation values and source records'));
    const table = document.createElement('table');
    for (const p of value.points) {
      const tr = document.createElement('tr');
      tr.append(
        text('td', p.date.slice(0, 10)),
        text('td', p.relativeMm.toFixed(2) + ' mm'),
      );
      const source = text('td', '');
      if (/^https?:\/\//.test(p.source || '')) {
        const link = text('a', 'Source record');
        link.href = p.source;
        link.target = '_blank';
        link.rel = 'noopener';
        source.append(link);
      } else source.textContent = p.source || 'Source identifier unavailable';
      tr.append(source);
      table.append(tr);
    }
    details.append(table);
    result.append(details);
  }
  async function inspect(longitude, latitude) {
    selectedPoint = { longitude, latitude };
    panel.querySelector('[data-frame]').replaceChildren();
    panel.querySelector('[data-frame-label]').hidden = true;
    const current = ++intent;
    request?.abort();
    request = new AbortController();
    data = null;
    result.replaceChildren();
    status.textContent =
      'Reading NASA / ASF history… this can take up to 90 seconds.';
    try {
      const response = await fetch(
        '/api/reference/ground-motion/history?' +
          new URLSearchParams({
            ...selectedPoint,
            direction: layer.getState().direction,
          }),
        {
          signal: AbortSignal.any([
            abort.signal,
            request.signal,
            AbortSignal.timeout(95000),
          ]),
        },
      );
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'History unavailable');
      if (current !== intent) return;
      data = body;
      const frames = panel.querySelector('[data-frame]');
      frames.replaceChildren();
      for (const series of data.series) {
        const option = text('option', series.frame);
        option.value = series.frame;
        frames.append(option);
      }
      panel.querySelector('[data-frame-label]').hidden = data.series.length < 2;
      draw();
    } catch (e) {
      if (current === intent && !abort.signal.aborted)
        status.textContent =
          e.name === 'TimeoutError'
            ? 'The history request timed out. Try again.'
            : e.message;
    }
  }
  for (const button of panel.querySelectorAll('[data-region]'))
    button.addEventListener(
      'click',
      () => void layer.flyTo(button.dataset.region),
      { signal: abort.signal },
    );
  on('[data-open-period-map]', 'click', async () => {
    try {
      await layer.setCoverage('permian');
      await layer.flyTo();
    } catch (error) {
      status.textContent = error.message;
    }
  });
  on('[data-period]', 'change', draw);
  on('[data-period-area]', 'click', () => void layer.flyTo());
  for (const button of panel.querySelectorAll('[data-pilot]'))
    button.addEventListener(
      'click',
      () => void layer.flyTo(button.dataset.pilot),
      { signal: abort.signal },
    );
  on('[data-map-period]', 'change', async (event) => {
    try {
      await layer.setMapPeriod(event.target.value);
    } catch (error) {
      panel.querySelector('[data-map-dates]').textContent = error.message;
    }
  });
  on('[data-frame]', 'change', draw);
  on('[data-coverage]', 'change', async (e) => {
    request?.abort();
    intent++;
    try {
      await layer.setCoverage(e.target.value);
    } catch (error) {
      status.textContent = error.message;
    }
    sync();
  });
  on('[data-orbit]', 'change', async (e) => {
    request?.abort();
    intent++;
    data = null;
    result.replaceChildren();
    try {
      await layer.setDirection(e.target.value);
      if (selectedPoint)
        await inspect(selectedPoint.longitude, selectedPoint.latitude);
    } catch (error) {
      status.textContent = error.message;
    }
  });
  function sync() {
    const state = layer.getState(),
      national = state.coverage === 'us';
    panel.querySelector('[data-coverage]').value = state.coverage;
    panel.querySelector('[data-national]').hidden = !national;
    panel.querySelector('[data-period-map]').hidden =
      state.coverage !== 'permian';
    panel.querySelector('[data-map-period]').value = state.mapPeriod;
    const rasters =
      state.periodManifest?.variants.filter(
        (item) => item.available && item.period === state.mapPeriod,
      ) || [];
    panel.querySelector('[data-map-dates]').textContent = rasters
      .map((item) => `${item.name}: ${item.startDate} → ${item.endDate}`)
      .join(' · ');
    panel.querySelector('[data-orbit]').value = state.direction;
    legend.querySelector('[data-variant]').parentElement.hidden =
      state.coverage !== 'crane';
  }
  const unsubscribe = layer.subscribe(sync);
  sync();
  return {
    inspect,
    clear() {
      intent++;
      request?.abort();
      selectedPoint = null;
      data = null;
      result.replaceChildren();
      panel.querySelector('[data-frame]').replaceChildren();
      panel.querySelector('[data-frame-label]').hidden = true;
      status.textContent =
        'Select a location. End date follows its latest available observation.';
    },
    destroy() {
      intent++;
      abort.abort();
      request?.abort();
      unsubscribe();
      panel.remove();
    },
  };
}
