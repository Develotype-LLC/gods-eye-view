import * as Cesium from 'cesium';
import {
  PIPELINE_DEFAULTS,
  parseEndpoint,
  validateInputs,
  candidateRoutes,
  sampleRoute,
  hydraulics,
  rankRoutes,
} from './pipelineModel.js';
const el = (tag, text) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = String(text);
  return n;
};
const money = (n) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(n)
    : 'Unavailable';
const DRAFT_KEY = 'landman:pipeline-draft:v1';
export function mountPipelinePlanner({ viewer, openInspector }) {
  const panel = el('section');
  panel.id = 'pipeline-panel';
  panel.setAttribute('aria-label', 'Produced-water pipeline planner');
  const fields = [
    ['flow', 'Flow · bbl/day', 1, 2000000, 1],
    ['diameter', 'Pipe inside diameter · in', 2, 60, 0.1],
    ['density', 'Fluid density · kg/m³', 900, 1500, 1],
    ['viscosity', 'Dynamic viscosity · cP', 0.2, 100, 0.1],
    ['roughness', 'Pipe roughness · mm', 0, 5, 0.0001],
    ['efficiency', 'Combined pump/motor efficiency · %', 10, 95, 1],
    ['electricity', 'Electricity · $/kWh', 0, 2, 0.01],
    ['hours', 'Operating hours/year', 1, 8760, 1],
    ['delivery', 'Required outlet pressure · psi gauge', 0, 2000, 1],
    ['width', 'Screening corridor width · ft', 10, 500, 10],
  ];
  panel.innerHTML = `<div class="pp-intro"><span class="pp-badge">PRODUCED WATER · PRELIMINARY</span><h3>Plan a pipeline</h3><p>Compare pumping energy and appraisal owner names across seven candidate alignments.</p></div>
 <form data-form><fieldset><legend>1 · Set the route</legend><label>Source A · latitude, longitude<input data-a required placeholder="31.6783, -102.3688"></label><button type="button" data-pick="a">Pick source on map</button><label>Delivery B · latitude, longitude<input data-b required placeholder="31.7000, -102.3200"></label><button type="button" data-pick="b">Pick delivery on map</button><button type="button" data-stop>Stop picking</button><button type="button" data-example>Load Permian example</button><p data-points>Endpoints not set. Use map picks or coordinates.</p></fieldset>
 <fieldset><legend>2 · Operating assumptions</legend><p>Editable screening assumptions, not measured fluid properties or a selected pipe specification.</p><div class="pp-inputs">${fields.map(([id, label, min, max, step]) => `<label>${label}<input data-input="${id}" type="number" min="${min}" max="${max}" step="${step}" value="${PIPELINE_DEFAULTS[id]}" required></label>`).join('')}</div></fieldset>
 <fieldset><legend>3 · Compare alternatives</legend><label>Balance: owner-name priority <output data-weight-label>50%</output><input data-input="weight" type="range" min="0" max="100" value="50"></label><div class="pp-scale"><span>Pumping cost</span><span>Fewer owner names</span></div><p>Relative ranking among these candidates. No global optimum, surveyed route, crossing clearance or secured ROW is implied.</p><button class="pp-primary" data-compare>Compare 7 corridors</button><button type="button" data-cancel hidden>Cancel analysis</button></fieldset></form>
 <p data-status role="status" aria-live="polite">Ready. Start with endpoints 0.25–50 km apart.</p><div class="pp-actions"><button data-save>Save draft here</button><button data-load>Load saved draft</button><button data-export disabled>Export selected route</button><button data-clear>Clear route</button></div><small>Drafts stay in this browser. Export a GeoJSON file to share a candidate and its assumptions.</small>
 <div data-results></div><div data-detail></div><details><summary>How estimates work and what is missing</summary><p>Single-phase, steady produced-water screening. Darcy–Weisbach friction with Colebrook turbulent friction (64/Re for laminar flow); hydraulic power divided by combined pump/motor efficiency. Source pressure is assumed to be 0 psi gauge. Head includes outlet pressure and sampled high points without energy recovery. Pipe diameter is inside diameter.</p><p>Terrain: Re:Earth modelled ellipsoidal heights, 25 samples per candidate. Between-sample crests, burial depth, fittings, gas, solids, transients, pump curves, pressure ratings and station spacing are not modelled. Annual cost is pumping electricity only; construction, easements and maintenance are excluded.</p><p>TxGIO appraisal owner names may represent different parties or aliases. Names are not a count of contracts. Unknown owner names and unmapped portions remain explicit. No wetland, road, rail, stream, permit or existing-pipeline avoidance is applied.</p><a href="https://www.energy.gov/ehss/articles/doe-hdbk-10123-92" target="_blank" rel="noopener">DOE fluid-flow method reference</a></details>`;
  document.body.append(panel);
  const data = new Cesium.CustomDataSource('Pipeline planning');
  void viewer.dataSources.add(data);
  const lifetime = new AbortController();
  let request = null,
    version = 0,
    picking = null,
    disposed = false,
    routes = [],
    inputs = null,
    selected = null,
    analysisAt = null;
  const on = (s, e, f) =>
    panel.querySelector(s).addEventListener(e, f, { signal: lifetime.signal });
  const status = (text) =>
    (panel.querySelector('[data-status]').textContent = text);
  function open() {
    openInspector({
      id: 'pipeline-planner',
      inspector: 'pipeline-panel',
      name: 'Pipeline planner',
    });
  }
  function stop() {
    picking = null;
    if (document.body.dataset.pipelinePicking) {
      delete document.body.dataset.pipelinePicking;
      if (document.body.dataset.locationPicking === 'pipeline')
        delete document.body.dataset.locationPicking;
    }
    viewer.scene.canvas.style.cursor = '';
  }
  function arm(which) {
    stop();
    open();
    picking = which;
    document.body.dataset.pipelinePicking = which;
    document.body.dataset.locationPicking = 'pipeline';
    viewer.scene.canvas.style.cursor = 'crosshair';
    status(`Click the map for ${which === 'a' ? 'source A' : 'delivery B'}.`);
  }
  function invalidate() {
    version++;
    request?.abort();
    request = null;
    routes = [];
    selected = null;
    panel.querySelector('[data-results]').replaceChildren();
    panel.querySelector('[data-detail]').replaceChildren();
    panel.querySelector('[data-export]').disabled = true;
    panel.querySelector('[data-cancel]').hidden = true;
    panel.querySelector('[data-compare]').disabled = false;
    draw();
    status('Inputs changed. Compare corridors to update results.');
  }
  function readInputs() {
    return validateInputs(
      Object.fromEntries(
        [...panel.querySelectorAll('[data-input]')].map((n) => [
          n.dataset.input,
          n.value.trim() === '' ? NaN : Number(n.value),
        ]),
      ),
    );
  }
  function endpoints() {
    return ['a', 'b'].map((k) =>
      parseEndpoint(panel.querySelector(`[data-${k}]`).value),
    );
  }
  function draw() {
    panel.querySelector('[data-points]').textContent = ['a', 'b']
      .map(
        (k) =>
          `${k.toUpperCase()}: ${panel.querySelector(`[data-${k}]`).value || 'not set'}`,
      )
      .join(' · ');
    data.entities.removeAll();
    for (const k of ['a', 'b']) {
      try {
        const p = parseEndpoint(panel.querySelector(`[data-${k}]`).value);
        data.entities.add({
          id: 'pipeline-' + k,
          position: Cesium.Cartesian3.fromDegrees(...p),
          point: {
            pixelSize: 13,
            color: Cesium.Color.fromCssColorString(
              k === 'a' ? '#54dac1' : '#f3c375',
            ),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Infinity,
          },
          label: {
            text: k === 'a' ? 'A · SOURCE' : 'B · DELIVERY',
            font: 'bold 13px sans-serif',
            pixelOffset: new Cesium.Cartesian2(0, -24),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            showBackground: true,
            disableDepthTestDistance: Infinity,
          },
        });
      } catch {}
    }
    for (const r of routes)
      data.entities.add({
        id: 'pipeline-' + r.id,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(r.coordinates.flat()),
          width: r.id === selected ? 6 : 2,
          clampToGround: true,
          material: Cesium.Color.fromCssColorString(
            r.id === selected ? '#54dac1' : '#c2c7ce',
          ).withAlpha(r.id === selected ? 1 : 0.45),
        },
      });
    viewer.scene.requestRender();
  }
  function fit() {
    const points = routes.length
      ? routes.flatMap((r) => r.coordinates)
      : endpoints();
    const rect = Cesium.Rectangle.fromDegrees(
      Math.min(...points.map((p) => p[0])) - 0.008,
      Math.min(...points.map((p) => p[1])) - 0.008,
      Math.max(...points.map((p) => p[0])) + 0.008,
      Math.max(...points.map((p) => p[1])) + 0.008,
    );
    const position = viewer.camera.getRectangleCameraCoordinates(rect);
    if (!position) return;
    const c = Cesium.Cartographic.fromCartesian(position);
    c.height = Math.max(c.height * 2, 6000);
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromRadians(
        c.longitude,
        c.latitude,
        c.height,
      ),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      duration: 1,
    });
  }
  async function json(url, options = {}) {
    const r = await fetch(url, options);
    const d = await r.json();
    if (!r.ok) throw Error(d.error || `Request failed (${r.status})`);
    return d;
  }
  async function analyze(event) {
    event.preventDefault();
    stop();
    invalidate();
    const intent = version;
    try {
      inputs = readInputs();
      const [a, b] = endpoints();
      const candidates = candidateRoutes(a, b);
      draw();
      request = new AbortController();
      const signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(150000),
      ]);
      panel.querySelector('[data-compare]').disabled = true;
      panel.querySelector('[data-cancel]').hidden = false;
      status(
        'Reading parcel crossings and terrain profiles… this can take a minute.',
      );
      const sampled = candidates.map((r) => sampleRoute(r.coordinates));
      const terrainPromise = json(
        '/api/terrain/heights?' +
          new URLSearchParams({
            points: sampled
              .flat()
              .map((p) => p.map((n) => n.toFixed(5)).join(','))
              .join(';'),
          }),
        { signal },
      ).catch((e) => {
        if (signal.aborted) throw e;
        return { results: [], unavailable: true };
      });
      const landPromise = json('/api/reference/land/route-corridors', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', 'X-Landman-Write': '1' },
        body: JSON.stringify({
          routes: candidates,
          width: inputs.width * 0.3048,
        }),
      });
      const [terrain, land] = await Promise.all([terrainPromise, landPromise]);
      if (disposed || intent !== version) return;
      analysisAt = land.at;
      routes = candidates.map((r, i) => ({
        ...r,
        points: sampled[i],
        hydraulics: hydraulics(
          sampled[i],
          sampled[i].map((_, j) => terrain.results?.[i * 25 + j]?.ellipsoid),
          inputs,
        ),
        land: land.results.find((v) => v.id === r.id),
      }));
      const ranking = rankRoutes(routes, inputs.weight);
      selected = ranking.balanced || routes[0].id;
      render();
      fit();
      status(
        terrain.unavailable
          ? 'Terrain unavailable. Owner crossings are shown; pumping cost is unavailable.'
          : 'Comparison ready. Review coverage and assumptions before choosing a corridor.',
      );
    } catch (e) {
      if (intent === version && !disposed)
        status(e.name === 'AbortError' ? 'Analysis cancelled.' : e.message);
    } finally {
      if (intent === version && !disposed) {
        panel.querySelector('[data-compare]').disabled = false;
        panel.querySelector('[data-cancel]').hidden = true;
      }
    }
  }
  function render() {
    const box = panel.querySelector('[data-results]');
    box.replaceChildren();
    const ranking = rankRoutes(routes, inputs.weight);
    box.append(el('h3', 'Candidate comparison'));
    if (!ranking.balanced)
      box.append(
        el(
          'p',
          'No automatic recommendation: full mapped coverage, known appraisal names and complete terrain are required. You can inspect every candidate below.',
        ),
      );
    const table = el('table');
    table.innerHTML =
      '<thead><tr><th>Candidate</th><th>mi</th><th>Owner names</th><th>Pumping / yr</th><th>Mapped</th></tr></thead>';
    const tbody = el('tbody');
    for (const r of routes) {
      const tr = el('tr');
      tr.className = r.id === selected ? 'pp-selected' : '';
      const cell = el('td'),
        button = el('button', r.name);
      button.setAttribute('aria-pressed', String(r.id === selected));
      button.addEventListener('click', () => {
        selected = r.id;
        render();
      });
      cell.append(button);
      const badges = [];
      if (ranking.energy === r.id) badges.push('Lowest pumping');
      if (ranking.owners === r.id) badges.push('Fewest names');
      if (ranking.balanced === r.id) badges.push('Balanced');
      if (badges.length) cell.append(el('small', badges.join(' · ')));
      tr.append(
        cell,
        el(
          'td',
          (
            r.coordinates
              .slice(1)
              .reduce(
                (s, p, i) =>
                  s +
                  Cesium.Cartesian3.distance(
                    Cesium.Cartesian3.fromDegrees(...r.coordinates[i]),
                    Cesium.Cartesian3.fromDegrees(...p),
                  ),
                0,
              ) / 1609.344
          ).toFixed(1),
        ),
        el(
          'td',
          r.land.truncated
            ? 'Too many'
            : r.land.parcelCount
              ? r.land.ownerCount
              : 'Unavailable',
        ),
        el('td', money(r.hydraulics?.annualCost)),
        el('td', (r.land.coverage * 100).toFixed(1) + '%'),
      );
      tbody.append(tr);
    }
    table.append(tbody);
    box.append(table);
    draw();
    renderDetail();
    panel.querySelector('[data-export]').disabled = !selected;
  }
  function renderDetail() {
    const box = panel.querySelector('[data-detail]');
    box.replaceChildren();
    const r = routes.find((v) => v.id === selected);
    if (!r) return;
    box.append(el('h3', r.name + ' · corridor review'));
    const fitButton = el('button', 'Fit candidate routes');
    fitButton.addEventListener('click', fit);
    box.append(fitButton);
    if (r.hydraulics) {
      const h = r.hydraulics;
      box.append(
        el(
          'p',
          `${h.powerKw.toFixed(1)} kW · ${h.headM.toFixed(1)} m pump head · ${h.velocity.toFixed(2)} m/s · ${h.pressurePsi.toFixed(0)} psi inlet pressure estimate`,
        ),
        el(
          'p',
          `${h.riseM.toFixed(1)} m end-to-end elevation change · ${h.frictionM.toFixed(1)} m pipe friction · terrain sample spacing up to ${Math.round(h.maxSampleGapM)} m`,
        ),
      );
      if (h.transition)
        box.append(
          el('p', 'Transitional flow: friction estimate is uncertain.'),
        );
      if (h.velocity > 3)
        box.append(
          el(
            'p',
            'Velocity exceeds 3 m/s; review diameter, wear and transient behavior.',
          ),
        );
      profile(box, h);
    } else
      box.append(
        el(
          'p',
          'Pumping estimate unavailable: terrain observations are incomplete. Missing heights are not treated as zero.',
        ),
      );
    box.append(
      el(
        'p',
        `${r.land.parcelCount}${r.land.truncated ? '+' : ''} corridor-intersecting parcels · ${r.land.unknownParcels ?? 'unknown'} parcels with missing owner names · ${(100 - r.land.coverage * 100).toFixed(2)}% centerline not covered by imported parcel polygons.`,
      ),
    );
    if (r.land.truncated)
      box.append(
        el(
          'p',
          'More than 3,000 parcels: narrow the route or corridor. Owner count and coverage were not computed.',
        ),
      );
    const disclosure = el('details');
    disclosure.open = true;
    disclosure.append(
      el(
        'summary',
        `Appraisal owner names to review (${r.land.owners.length})`,
      ),
    );
    const list = el('div');
    list.className = 'pp-owner-list';
    for (const o of r.land.owners) {
      const row = el('div');
      row.append(
        el('strong', o.name),
        el('small', `${o.parcels} parcels · ${o.counties.join(', ')}`),
      );
      list.append(row);
    }
    disclosure.append(list);
    box.append(disclosure);
    const sources = el('details');
    sources.append(el('summary', 'County sources and dates'));
    for (const s of r.land.sources) {
      const a = el('a', s.county + ' · ' + s.dates.join(', '));
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener';
      sources.append(a);
    }
    box.append(sources);
  }
  function profile(box, h) {
    const ns = 'http://www.w3.org/2000/svg',
      svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 500 135');
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      'Sampled terrain elevation along selected route',
    );
    const min = Math.min(...h.heights),
      max = Math.max(...h.heights),
      range = Math.max(1, max - min);
    const line = document.createElementNS(ns, 'polyline');
    line.setAttribute(
      'points',
      h.heights
        .map(
          (z, i) =>
            `${20 + (h.distanceM[i] / h.lengthM) * 460},${100 - ((z - min) / range) * 75}`,
        )
        .join(' '),
    );
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', '#54dac1');
    line.setAttribute('stroke-width', '3');
    svg.append(line);
    for (const [x, y, text] of [
      [20, 15, `${max.toFixed(0)} m`],
      [20, 120, `A · ${min.toFixed(0)} m min`],
      [350, 120, `${(h.lengthM / 1000).toFixed(1)} km · B`],
    ]) {
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', x);
      t.setAttribute('y', y);
      t.setAttribute('fill', '#bcd0cd');
      t.setAttribute('font-size', '12');
      t.textContent = text;
      svg.append(t);
    }
    box.append(svg);
  }
  on('[data-form]', 'submit', analyze);
  for (const field of panel.querySelectorAll('input:not([type="range"])'))
    field.addEventListener(
      'input',
      () => {
        stop();
        invalidate();
      },
      { signal: lifetime.signal },
    );
  on('[data-input="weight"]', 'input', (e) => {
    panel.querySelector('[data-weight-label]').textContent =
      e.target.value + '%';
    if (inputs) inputs.weight = Number(e.target.value);
    if (routes.length) render();
  });
  for (const which of ['a', 'b'])
    on(`[data-pick="${which}"]`, 'click', () => arm(which));
  on('[data-stop]', 'click', () => {
    stop();
    status('Map picking paused.');
  });
  on('[data-cancel]', 'click', () => {
    invalidate();
    status('Analysis cancelled.');
  });
  on('[data-example]', 'click', () => {
    stop();
    panel.querySelector('[data-a]').value = '31.6783, -102.3688';
    panel.querySelector('[data-b]').value = '31.7000, -102.3200';
    invalidate();
    fit();
    status(
      'Permian example endpoints loaded. These are demonstration locations, not a proposed project.',
    );
  });
  on('[data-save]', 'click', () => {
    try {
      const [a, b] = endpoints();
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ version: 1, a, b, inputs: readInputs() }),
      );
      status('Draft saved in this browser.');
    } catch (e) {
      status(e.message);
    }
  });
  on('[data-load]', 'click', () => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
      if (d?.version !== 1) throw Error('No saved draft in this browser.');
      validateInputs(d.inputs);
      for (const k of ['a', 'b']) {
        parseEndpoint(d[k][1] + ', ' + d[k][0]);
        panel.querySelector(`[data-${k}]`).value = d[k][1] + ', ' + d[k][0];
      }
      for (const n of panel.querySelectorAll('[data-input]'))
        n.value = d.inputs[n.dataset.input];
      panel.querySelector('[data-weight-label]').textContent =
        d.inputs.weight + '%';
      stop();
      invalidate();
      fit();
      status('Saved inputs restored. Compare again to refresh source data.');
    } catch (e) {
      status(e.message);
    }
  });
  on('[data-clear]', 'click', () => {
    stop();
    panel.querySelector('[data-a]').value = '';
    panel.querySelector('[data-b]').value = '';
    invalidate();
    status('Route cleared. Saved browser draft remains available.');
  });
  on('[data-export]', 'click', () => {
    const r = routes.find((v) => v.id === selected);
    if (!r) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: r.coordinates },
                properties: {
                  name: r.name,
                  status: 'Preliminary candidate; not surveyed or approved',
                  analysisAt,
                  assumptions: inputs,
                  hydraulics: r.hydraulics,
                  land: r.land,
                  limitations:
                    'Appraisal names are not verified legal parties or contracts. Energy only; no construction/ROW costs, obstacle avoidance or transient/station design.',
                },
              },
            ],
          },
          null,
          2,
        ),
      ],
      { type: 'application/geo+json' },
    );
    const url = URL.createObjectURL(blob),
      a = el('a');
    a.href = url;
    a.download = 'landman-produced-water-route.geojson';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const picker = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  picker.setInputAction((event) => {
    if (!picking || document.body.dataset.pipelinePicking !== picking) return;
    const ray = viewer.camera.getPickRay(event.position),
      position = ray && viewer.scene.globe.pick(ray, viewer.scene);
    if (!position) return;
    const c = Cesium.Cartographic.fromCartesian(position),
      which = picking;
    panel.querySelector(`[data-${which}]`).value =
      `${Cesium.Math.toDegrees(c.latitude).toFixed(5)}, ${Cesium.Math.toDegrees(c.longitude).toFixed(5)}`;
    stop();
    invalidate();
    panel.querySelector('[data-points]').textContent =
      `A: ${panel.querySelector('[data-a]').value || 'not set'} · B: ${panel.querySelector('[data-b]').value || 'not set'}`;
    status(
      `${which === 'a' ? 'Source A' : 'Delivery B'} selected. Change it with the pick button or coordinates.`,
    );
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  return {
    open,
    stop,
    destroy() {
      disposed = true;
      version++;
      request?.abort();
      stop();
      lifetime.abort();
      picker.destroy();
      if (!viewer.isDestroyed()) viewer.dataSources.remove(data, true);
      panel.remove();
    },
  };
}
