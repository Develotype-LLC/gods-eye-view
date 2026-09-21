import { historyWindow } from './motionHistory.js';

export function mountMotionHistoryPanel(legend, layer) {
  const panel = document.createElement('div');
  panel.className = 'motion-history';
  panel.innerHTML = `<label>Coverage<select data-coverage><option value="us">United States · ASF service</option><option value="crane">Crane County · local archive</option></select></label>
  <div data-national><div class="motion-regions"><button type="button" data-region="us">Lower 48</button><button type="button" data-region="alaska">Alaska</button><button type="button" data-region="hawaii">Hawaii</button></div><p>US coverage where NASA has valid observations, including Alaska and Hawaii. The map shows <strong>long-term velocity</strong>; the period below changes the selected point's history.</p>
  <label>Satellite orbit<select data-orbit><option value="ascending">Ascending</option><option value="descending">Descending</option></select></label>
  <p>Click the map to inspect a location, or enter coordinates.</p><form data-history-form><input aria-label="Ground movement coordinates" placeholder="31.4007, -102.6049" required><button>Read history</button></form>
  <label>Change period<select data-period><option value="month">1 month</option><option value="year" selected>1 year</option><option value="five">5 years</option><option value="ten">10 years</option><option value="all">All available</option></select></label>
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
      height = 140,
      ys = value.points.map((p) => p.relativeMm),
      min = Math.min(0, ...ys),
      span = Math.max(1, Math.max(0, ...ys) - min),
      t0 = Date.parse(value.start),
      dt = Date.parse(value.end) - t0;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      'Displacement observations relative to the first date in the selected period',
    );
    for (const p of value.points) {
      const dot = document.createElementNS(svg.namespaceURI, 'circle');
      dot.setAttribute(
        'cx',
        String(8 + ((Date.parse(p.date) - t0) / dt) * 284),
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
      tr.title = p.source;
      table.append(tr);
    }
    details.append(table);
    result.append(details);
  }
  async function inspect(longitude, latitude) {
    selectedPoint = { longitude, latitude };
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
  on('[data-history-form]', 'submit', (event) => {
    event.preventDefault();
    const parts = panel
      .querySelector('input')
      .value.split(',')
      .map((s) => s.trim());
    const [lat, lon] = parts.map(Number);
    if (
      parts.length !== 2 ||
      parts.some((s) => !s) ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 85 ||
      Math.abs(lon) > 180
    ) {
      status.textContent = 'Enter latitude, longitude in decimal degrees.';
      return;
    }
    void inspect(lon, lat);
  });
  for (const button of panel.querySelectorAll('[data-region]'))
    button.addEventListener(
      'click',
      () => void layer.flyTo(button.dataset.region),
      { signal: abort.signal },
    );
  on('[data-period]', 'change', draw);
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
    panel.querySelector('[data-orbit]').value = state.direction;
    legend.querySelector('[data-variant]').parentElement.hidden = national;
  }
  const unsubscribe = layer.subscribe(sync);
  sync();
  return {
    inspect,
    destroy() {
      intent++;
      abort.abort();
      request?.abort();
      unsubscribe();
      panel.remove();
    },
  };
}
