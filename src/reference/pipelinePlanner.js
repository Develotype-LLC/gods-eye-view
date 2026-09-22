import { OPERATING_PRESETS, matchOperatingPreset } from './pipelinePresets.js';
import * as Cesium from 'cesium';
import {
  ROUTING_DEFAULTS,
  readWaypoints,
  validateRouting,
  validateExclusions,
  studyBounds,
  generateLonghaulRoutes,
} from './longhaulRouting.js';
import {
  distance,
  parseEndpoint,
  validateInputs,
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
  panel.setAttribute('aria-label', 'LONG-Haul produced-water routing');
  const fields = [
    ['flow', 'Flow · bbl/day', 1, 2000000, 1],
    ['diameter', 'Pipe inside diameter · in', 2, 60, 0.001],
    ['density', 'Fluid density · kg/m³', 900, 1500, 1],
    ['viscosity', 'Dynamic viscosity · cP', 0.2, 100, 0.1],
    ['roughness', 'Pipe roughness · mm', 0, 5, 0.0001],
    ['efficiency', 'Combined pump/motor efficiency · %', 10, 95, 1],
    ['electricity', 'Electricity · $/kWh', 0, 2, 0.01],
    ['hours', 'Operating hours/year', 1, 8760, 1],
    ['delivery', 'Required outlet pressure · psi gauge', 0, 2000, 1],
    ['width', 'Screening corridor width · ft', 10, 500, 10],
  ];
  panel.innerHTML = `<div class="pp-intro"><span class="pp-badge">PRODUCED WATER · PRELIMINARY</span><h3>LONG-Haul</h3><p>Plan produced-water corridors around infrastructure, crossings and land constraints.</p></div>
 <form data-form><fieldset><legend>1 · Set the route</legend><label>Source A · latitude, longitude<input data-a required placeholder="31.6783, -102.3688"></label><button type="button" data-pick="a">Pick source on map</button><label>Delivery B · latitude, longitude<input data-b required placeholder="31.7000, -102.3200"></label><button type="button" data-pick="b">Pick delivery on map</button><button type="button" data-stop>Stop picking</button><button type="button" data-example>Load Permian example</button><p data-points>Endpoints not set. Use map picks or coordinates.</p><label>Required waypoints · latitude, longitude, one per line<textarea data-waypoints rows="3" placeholder="Optional · visited in listed order"></textarea></label><button type="button" data-add-via>Add waypoint on map</button><button type="button" data-draw-exclusion>Draw exclusion area</button><button type="button" data-finish-exclusion hidden>Finish area</button><button type="button" data-undo-exclusion hidden>Undo vertex</button><p data-drawing role="status"></p><div data-exclusions></div></fieldset>
 <fieldset><legend>2 · Routing preferences</legend><label>Mapped pipeline corridors<select data-route="corridor"><option value="prefer">Prefer parallel corridors</option><option value="neutral">Neutral</option><option value="avoid">Discourage parallel corridors</option></select></label><label>Operator name contains · optional<input data-route="operator" placeholder="All mapped operators"></label><p>Operator filtering expresses a preference; it does not establish client ownership, permission, operating status or available capacity.</p><div class="pp-inputs"><label>Parallel-corridor discount · %<input data-route="discount" type="number" min="0" max="70" step="1" value="30" required></label><label>Highway crossing penalty · equivalent km<input data-route="majorRoad" type="number" min="0" max="100" step="0.1" value="5" required></label><label>Other road crossing · equivalent km<input data-route="road" type="number" min="0" max="100" step="0.1" value="0.5" required></label><label>Rail crossing · equivalent km<input data-route="rail" type="number" min="0" max="100" step="0.1" value="8" required></label><label>Waterway crossing · equivalent km<input data-route="water" type="number" min="0" max="100" step="0.1" value="3" required></label></div><p>These are route-search preferences, not dollar estimates. A 5 km penalty makes one crossing equivalent to 5 km of additional new route. Parallel means aligned within 100 m of a mapped pipeline.</p><label><input type="checkbox" data-show-context checked> Show routing infrastructure and study boundary</label></fieldset>
 <fieldset><legend>3 · Operating assumptions</legend><label>Produced-water operating scenario<select data-operating-preset>${OPERATING_PRESETS.map((p) => `<option value="${p.id}">${p.label}</option>`).join('')}<option value="custom">Custom assumptions</option></select></label><p data-operating-summary aria-live="polite"></p><p>Single-pipe screening only; this does not size parallel pipes. Starting scenarios, not rated capacity or an engineered pipe selection. Flow targets and operating values are planning assumptions.</p><details data-operating-details><summary>View or customize assumptions</summary><div class="pp-inputs">${fields.map(([id, label, min, max, step]) => `<label>${label}<input data-input="${id}" type="number" min="${min}" max="${max}" step="${step}" value="${OPERATING_PRESETS[0].inputs[id]}" required></label>`).join('')}</div><p>HDPE IPS DR11 dimensions use published average inside diameters. Confirm fluid compatibility, temperature, pressure, surge and pump stations for the project.</p><a href="https://www.cpchem.com/sites/default/files/2022-03/PP%20501%20Driscoplex%204000%204100%20Water%20Pipe%20Brochure.pdf" target="_blank" rel="noopener">Pipe dimension reference · Table 2</a></details></fieldset>
 <fieldset><legend>4 · Compare alternatives</legend><label>Balance: owner-name priority <output data-weight-label>50%</output><input data-input="weight" type="range" min="0" max="100" value="50"></label><div class="pp-scale"><span>Pumping cost</span><span>Fewer owner names</span></div><p>Relative ranking among these candidates. No global optimum, surveyed route, crossing clearance or secured ROW is implied.</p><button class="pp-primary" data-compare>Find route alternatives</button><button type="button" data-cancel hidden>Cancel analysis</button></fieldset></form>
 <p data-status role="status" aria-live="polite">Ready. Set endpoints, then add any required waypoints or exclusion areas. Interactive study chain: 50 m–250 km; large or dense source inventories may require a smaller study.</p><div class="pp-actions"><button data-save>Save inputs on this device</button><button data-load>Load saved draft</button><button data-export disabled>Export candidate GeoJSON</button><button data-clear>Clear route</button></div><small>Drafts stay in this browser. Export a GeoJSON file to share a candidate and its assumptions.</small>
 <div data-results></div><div data-detail></div><details><summary>How estimates work and what is missing</summary><p>Single-phase, steady produced-water screening. Darcy–Weisbach friction with Colebrook turbulent friction (64/Re for laminar flow); hydraulic power divided by combined pump/motor efficiency. Source pressure is assumed to be 0 psi gauge. Head includes outlet pressure and sampled high points without energy recovery. Pipe diameter is inside diameter.</p><p>Terrain: Re:Earth modelled ellipsoidal heights sampled along every route segment, with spacing and progress shown. Between-sample crests, burial depth, fittings, gas, solids, transients, pump curves, pressure ratings and station spacing are not modelled. Annual cost is pumping electricity only; construction, easements and maintenance are excluded.</p><p>TxGIO appraisal owner names may represent different parties or aliases. Names are not a count of contracts. Unknown owner names and unmapped portions remain explicit. Routing uses a finite grid search with mapped RRC pipeline proximity and OSM road, rail and waterway crossing penalties. Drawn exclusions are hard constraints. Routes are searched for distance, infrastructure balance and stronger crossing avoidance, then evaluated for pumping and owners. Terrain and ownership do not yet guide the path search itself. Wetlands, permits, subsurface utilities and engineering clearances are not evaluated. Missing source inventories remain explicit.</p><a href="https://www.energy.gov/ehss/articles/doe-hdbk-10123-92" target="_blank" rel="noopener">DOE fluid-flow method reference</a></details>`;
  // Keep existing calculation controls, but reveal them in task order.
  const steps = el('nav');
  steps.className = 'pp-steps';
  steps.setAttribute('aria-label', 'LONG-Haul steps');
  for (const [id, label] of [
    ['setup', '1 · Setup'],
    ['compare', '2 · Compare'],
    ['land', '3 · Land review'],
  ]) {
    const button = el('button', label);
    button.type = 'button';
    button.dataset.stage = id;
    button.addEventListener('click', () => {
      stop();
      setStage(id);
    });
    steps.append(button);
  }
  const studySummary = el('p');
  studySummary.dataset.studySummary = '';
  panel.querySelector('.pp-intro').after(steps, studySummary);
  const setup = el('div');
  setup.dataset.stagePanel = 'setup';
  const compare = el('div');
  compare.dataset.stagePanel = 'compare';
  const landReview = el('div');
  landReview.dataset.stagePanel = 'land';
  const form = panel.querySelector('[data-form]');
  form.before(setup);
  setup.append(form);
  const ranking = form
    .querySelector('[data-input="weight"]')
    .closest('fieldset');
  const compareControls = el('fieldset');
  compareControls.append(el('legend', 'Compare priorities'));
  for (const node of [...ranking.children])
    if (!node.matches('legend,button')) compareControls.append(node);
  compareControls.querySelector('label').firstChild.textContent =
    'Recorded owner-name priority ';
  compareControls.querySelector('p').textContent =
    'Highlights the best eligible alternative for your priorities; table order and route paths stay fixed. Manual selection remains yours.';
  ranking.querySelector('legend').textContent = 'Find alternatives';
  compare.append(panel.querySelector('[data-results]'), compareControls);
  const reviewButton = el('button', 'Review selected route’s land →');
  reviewButton.type = 'button';
  reviewButton.addEventListener('click', () => setStage('land'));
  compareControls.before(reviewButton);
  landReview.append(panel.querySelector('[data-detail]'));
  setup.after(compare, landReview);
  const preferencesField = form
    .querySelector('[data-route="discount"]')
    .closest('.pp-inputs');
  const advanced = el('details');
  advanced.append(el('summary', 'Advanced routing penalties'));
  preferencesField.before(advanced);
  advanced.append(preferencesField);
  document.body.append(panel);
  const data = new Cesium.CustomDataSource('LONG-Haul routes');
  void viewer.dataSources.add(data);
  const lifetime = new AbortController();
  let request = null,
    version = 0,
    picking = null,
    disposed = false,
    routes = [],
    inputs = null,
    selected = null,
    analysisAt = null,
    infrastructure = null,
    routingRun = null,
    preferences = { ...ROUTING_DEFAULTS },
    exclusions = [],
    drawing = [],
    stage = 'setup';
  const on = (s, e, f) =>
    panel.querySelector(s).addEventListener(e, f, { signal: lifetime.signal });
  const status = (text) =>
    (panel.querySelector('[data-status]').textContent = text);
  function setStage(next) {
    const previousStage = stage;
    stage = next !== 'setup' && !routes.length ? 'setup' : next;
    for (const container of panel.querySelectorAll('[data-stage-panel]'))
      container.hidden = container.dataset.stagePanel !== stage;
    for (const button of steps.querySelectorAll('button')) {
      button.disabled = button.dataset.stage !== 'setup' && !routes.length;
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.stage === stage),
      );
    }
    if (stage !== previousStage) {
      panel.scrollTop = 0;
      const inspector = panel.closest('.lm-inspector');
      if (inspector) inspector.scrollTop = 0;
    }
    studySummary.textContent = `A: ${panel.querySelector('[data-a]').value || 'not set'} → B: ${panel.querySelector('[data-b]').value || 'not set'}${selected ? ' · ' + (routes.find((r) => r.id === selected)?.name || '') : ''}`;
  }
  function open() {
    openInspector({
      id: 'pipeline-planner',
      inspector: 'pipeline-panel',
      name: 'LONG-Haul',
    });
  }
  function stop() {
    picking = null;
    panel.querySelector('[data-drawing]').textContent = '';
    if (document.body.dataset.pipelinePicking) {
      delete document.body.dataset.pipelinePicking;
      if (document.body.dataset.locationPicking === 'pipeline')
        delete document.body.dataset.locationPicking;
    }
    viewer.scene.canvas.style.cursor = '';
    controls();
  }
  function arm(which) {
    stop();
    open();
    picking = which;
    document.body.dataset.pipelinePicking = which;
    document.body.dataset.locationPicking = 'pipeline';
    viewer.scene.canvas.style.cursor = 'crosshair';
    const hint =
      which === 'exclusion'
        ? 'Click at least three boundary vertices, then Finish area.'
        : which === 'via'
          ? 'Click the map to add a required waypoint.'
          : `Click the map for ${which === 'a' ? 'source A' : 'delivery B'}.`;
    panel.querySelector('[data-drawing]').textContent = hint;
    status(hint);
    controls();
  }
  function invalidate() {
    version++;
    request?.abort();
    request = null;
    routes = [];
    selected = null;
    setStage('setup');
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
  function updateOperatingSummary() {
    const values = Object.fromEntries(
      fields.map(([id]) => [
        id,
        Number(panel.querySelector(`[data-input="${id}"]`).value),
      ]),
    );
    const preset = matchOperatingPreset(values);
    panel.querySelector('[data-operating-preset]').value =
      preset?.id || 'custom';
    panel.querySelector('[data-operating-summary]').textContent =
      `${preset ? preset.description : 'Custom operating values'} · ${values.flow.toLocaleString()} bbl/day · ${values.diameter} in inside diameter.`;
  }
  on('[data-operating-preset]', 'change', (event) => {
    const preset = OPERATING_PRESETS.find((p) => p.id === event.target.value);
    if (preset) {
      for (const [id, value] of Object.entries(preset.inputs))
        panel.querySelector(`[data-input="${id}"]`).value = value;
      updateOperatingSummary();
    } else {
      panel.querySelector('[data-operating-details]').open = true;
      panel.querySelector('[data-operating-summary]').textContent =
        'Edit the operating values below. Existing values are retained until you change them.';
    }
    stop();
    invalidate();
  });
  updateOperatingSummary();
  function endpoints() {
    return ['a', 'b'].map((k) =>
      parseEndpoint(panel.querySelector(`[data-${k}]`).value),
    );
  }
  function routingInputs() {
    return validateRouting(
      Object.fromEntries(
        [...panel.querySelectorAll('[data-route]')].map((n) => [
          n.dataset.route,
          ['corridor', 'operator'].includes(n.dataset.route)
            ? n.value
            : n.value.trim() === ''
              ? NaN
              : Number(n.value),
        ]),
      ),
    );
  }
  function controls() {
    const box = panel.querySelector('[data-exclusions]');
    box.replaceChildren();
    exclusions.forEach((ring, i) => {
      const row = el('div', `Exclusion ${i + 1} · ${ring.length} vertices `),
        button = el('button', 'Remove area');
      button.type = 'button';
      button.setAttribute('aria-label', `Remove exclusion ${i + 1}`);
      button.onclick = () => {
        exclusions.splice(i, 1);
        controls();
        invalidate();
      };
      row.append(button);
      box.append(row);
    });
    panel.querySelector('[data-finish-exclusion]').hidden =
      picking !== 'exclusion';
    panel.querySelector('[data-undo-exclusion]').hidden =
      picking !== 'exclusion';
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
    try {
      readWaypoints(panel.querySelector('[data-waypoints]').value).forEach(
        (p, i) =>
          data.entities.add({
            position: Cesium.Cartesian3.fromDegrees(...p),
            point: {
              pixelSize: 10,
              color: Cesium.Color.GOLD,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
            label: {
              text: `VIA ${i + 1}`,
              disableDepthTestDistance: Infinity,
              font: '12px sans-serif',
              pixelOffset: new Cesium.Cartesian2(0, -18),
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              showBackground: true,
            },
          }),
      );
    } catch {}
    exclusions.forEach((ring, i) =>
      data.entities.add({
        name: `Exclusion ${i + 1}`,
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(ring.flat()),
          material: Cesium.Color.RED.withAlpha(0.25),
          outline: true,
          outlineColor: Cesium.Color.RED,
        },
      }),
    );
    if (drawing.length > 1)
      data.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(drawing.flat()),
          clampToGround: true,
          width: 3,
          material: Cesium.Color.RED,
        },
      });
    drawing.forEach((p) =>
      data.entities.add({
        position: Cesium.Cartesian3.fromDegrees(...p),
        point: {
          pixelSize: 8,
          color: Cesium.Color.RED,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      }),
    );
    if (infrastructure && panel.querySelector('[data-show-context]').checked) {
      // Context remains a bounded display subset; the search uses the full returned inventory.
      for (const f of infrastructure.features.slice(0, 2000))
        data.entities.add({
          name: `${f.kind}: ${f.name}`,
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(f.coordinates.flat()),
            width: f.kind === 'pipeline' ? 2 : 1,
            clampToGround: true,
            material: Cesium.Color.fromCssColorString(
              f.kind === 'pipeline'
                ? '#d7a6ff'
                : f.kind === 'water'
                  ? '#57a5ed'
                  : f.kind === 'rail'
                    ? '#ffb078'
                    : '#f4dc92',
            ).withAlpha(0.5),
          },
        });
      const [w, s, e, n] = infrastructure.bounds;
      data.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray([
            w,
            s,
            e,
            s,
            e,
            n,
            w,
            n,
            w,
            s,
          ]),
          width: 2,
          clampToGround: true,
          material: Cesium.Color.WHITE.withAlpha(0.5),
        },
      });
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
      : [
          ...endpoints(),
          ...readWaypoints(panel.querySelector('[data-waypoints]').value),
        ];
    const rect = Cesium.Rectangle.fromDegrees(
      Math.min(...points.map((p) => p[0])) - 0.008,
      Math.min(...points.map((p) => p[1])) - 0.008,
      Math.max(...points.map((p) => p[0])) + 0.008,
      Math.max(...points.map((p) => p[1])) + 0.008,
    );
    const position = viewer.camera.getRectangleCameraCoordinates(rect);
    if (!position) return;
    const c = Cesium.Cartographic.fromCartesian(position);
    const width = viewer.scene.canvas.clientWidth;
    const left =
      document.querySelector('.lm-sidebar')?.getBoundingClientRect().right || 0;
    const right =
      document.querySelector('.lm-inspector')?.getBoundingClientRect().left ||
      width;
    const available = right - left;
    c.height = Math.max(
      c.height * (available > 250 ? Math.max(2, width / available) : 2),
      6000,
    );
    if (available > 250) {
      const horizontalFov = viewer.camera.frustum.fov || Math.PI / 3;
      const span =
        2 * Math.max(1000, c.height - 1000) * Math.tan(horizontalFov / 2);
      c.longitude +=
        (((width / 2 - (left + right) / 2) / width) * span) /
        (6378137 * Math.cos(c.latitude));
    }
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
    if (drawing.length) {
      status('Finish or discard the exclusion being drawn before routing.');
      panel.querySelector('[data-drawing]').textContent =
        'Finish this area, or use Stop picking to discard it.';
      return;
    }
    stop();
    invalidate();
    const intent = version;
    try {
      inputs = readInputs();
      const [a, b] = endpoints();
      if (drawing.length)
        throw Error(
          'Finish or discard the exclusion being drawn before routing.',
        );
      const points = [
        a,
        ...readWaypoints(panel.querySelector('[data-waypoints]').value),
        b,
      ];
      preferences = routingInputs();
      const bounds = studyBounds(points, exclusions);
      request = new AbortController();
      const signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(900000),
      ]);
      panel.querySelector('[data-compare]').disabled = true;
      panel.querySelector('[data-cancel]').hidden = false;
      status('Loading mapped pipelines, roads, railways and waterways…');
      infrastructure = await json(
        '/api/reference/land/infrastructure?' +
          new URLSearchParams({ bbox: bounds.join(',') }),
        { signal },
      );
      if (intent !== version || disposed) return;
      draw();
      routingRun = await generateLonghaulRoutes({
        points,
        bounds,
        features: infrastructure.features,
        exclusions,
        preferences,
        signal,
        onProgress: (text) => {
          if (intent === version && !disposed) status(text);
        },
      });
      const candidates = routingRun.routes;
      const sampled = candidates.map((r) => {
        const total = r.coordinates
            .slice(1)
            .reduce((n, p, i) => n + distance(r.coordinates[i], p), 0),
          spacing = Math.max(250, Math.ceil(total / 300)),
          result = [r.coordinates[0]];
        for (let i = 1; i < r.coordinates.length; i++) {
          const a = r.coordinates[i - 1],
            b = r.coordinates[i],
            count = Math.max(1, Math.ceil(distance(a, b) / spacing));
          for (let j = 1; j <= count; j++)
            result.push([
              a[0] + ((b[0] - a[0]) * j) / count,
              a[1] + ((b[1] - a[1]) * j) / count,
            ]);
        }
        return result;
      });
      const terrainPromise = (async () => {
        const points = sampled.flat(),
          results = [];
        for (let offset = 0; offset < points.length; offset += 64) {
          signal.throwIfAborted();
          status(
            `Sampling route terrain ${offset}/${points.length} points; checking parcel crossings…`,
          );
          try {
            const d = await json(
              '/api/terrain/heights?' +
                new URLSearchParams({
                  points: points
                    .slice(offset, offset + 64)
                    .map((p) => p.map((n) => n.toFixed(5)).join(','))
                    .join(';'),
                }),
              { signal },
            );
            for (let j = 0; j < Math.min(64, points.length - offset); j++)
              results.push(d.results?.[j] || null);
          } catch (e) {
            if (signal.aborted) throw e;
            results.push(
              ...Array(Math.min(64, points.length - offset)).fill(null),
            );
          }
        }
        return {
          results,
          unavailable: results.some((r) => !Number.isFinite(r?.ellipsoid)),
        };
      })();
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
          sampled[i].map(
            (_, j) =>
              terrain.results?.[
                sampled.slice(0, i).reduce((n, p) => n + p.length, 0) + j
              ]?.ellipsoid,
          ),
          inputs,
        ),
        land: land.results.find((v) => v.id === r.id),
      }));
      const ranking = rankRoutes(routes, inputs.weight);
      selected =
        (infrastructure.sources.every((s) => s.status === 'available') &&
          ranking.balanced) ||
        routes[0].id;
      render();
      setStage('compare');
      fit();
      status(
        infrastructure.sources.some((s) => s.status !== 'available')
          ? 'Partial infrastructure inventory. Review the missing sources before comparing routes.'
          : terrain.unavailable
            ? 'Some terrain is unavailable. Only complete profiles receive pumping estimates.'
            : 'Comparison ready. Review coverage and assumptions before choosing a corridor.',
      );
    } catch (e) {
      if (intent === version && !disposed) {
        request?.abort();
        status(e.name === 'AbortError' ? 'Analysis cancelled.' : e.message);
      }
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
    const method = el('details');
    method.append(el('summary', 'Sources, definitions & calculation details'));
    box.append(el('h3', 'Compare route alternatives'));
    const canRank =
      Boolean(ranking.balanced) &&
      infrastructure?.sources.every((s) => s.status === 'available');
    panel.querySelector('[data-input="weight"]').disabled = !canRank;
    compareControls.querySelector('p').textContent = canRank
      ? 'Highlights the best eligible alternative for your priorities; table order and paths stay fixed. Your selected candidate stays selected.'
      : 'Ranking unavailable: candidates need complete parcel coverage, no unresolved owners, terrain estimates and available infrastructure. Compare the facts and select a candidate manually.';
    if (infrastructure) {
      method.append(
        el(
          'p',
          `Search grid: ${routingRun.resolutionM} m · purple: pipelines · gold: roads · orange: rail · blue: waterways. Context display capped at 2,000 features; analysis uses ${infrastructure.features.length}.`,
        ),
      );
      for (const s of infrastructure.sources)
        method.append(
          el(
            'p',
            `${s.name}: ${s.status} · retrieved ${s.at.slice(0, 10)}${s.note ? ' · ' + s.note : ''}`,
          ),
        );
      if (infrastructure.sources.some((s) => s.status !== 'available'))
        method.append(
          el(
            'strong',
            'Incomplete infrastructure inventory: these alternatives cannot establish the fewest crossings or best corridor.',
          ),
        );
      method.append(
        el(
          'p',
          'Alternatives may coincide when the available data and preferences favor the same path. Ownership and pumping are evaluated after routing; they are not yet path-search costs.',
        ),
      );
    }
    if (
      !ranking.balanced ||
      infrastructure?.sources.some((s) => s.status !== 'available')
    )
      method.append(
        el(
          'p',
          'No automatic recommendation: available infrastructure inventories, full mapped parcel coverage, known appraisal names and complete terrain are required. You can inspect every candidate below.',
        ),
      );
    method.append(
      el(
        'p',
        'Known names: distinct recorded appraisal names, not verified legal parties or contracts. Parcels: corridor intersections. Unresolved: missing owner names, including partially named parcels. Mapped: centerline covered by imported parcels.',
      ),
    );
    if (!canRank)
      box.append(
        el(
          'p',
          'Coverage is incomplete. No automatic recommendation; unresolved land remains in the comparison.',
        ),
      );
    const table = el('table');
    table.innerHTML =
      '<thead><tr><th>Candidate</th><th>mi</th><th>Known names</th><th>Parcels</th><th>Unresolved</th><th>Electricity / year</th><th>Mapped</th></tr></thead>';
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
      if (
        infrastructure?.sources.every((s) => s.status === 'available') &&
        ranking.energy === r.id
      )
        badges.push('Lowest pumping');
      if (
        infrastructure?.sources.every((s) => s.status === 'available') &&
        ranking.owners === r.id
      )
        badges.push('Fewest names');
      if (
        infrastructure?.sources.every((s) => s.status === 'available') &&
        ranking.balanced === r.id
      )
        badges.push('Balanced');
      if (r.routing)
        cell.append(
          el(
            'small',
            `${infrastructure?.sources[1]?.status === 'available' ? Object.values(r.routing.counts).reduce((a, b) => a + b, 0) + ' mapped crossings' : 'Crossings unknown'} · ${infrastructure?.sources[0]?.status === 'available' ? r.routing.followingPct.toFixed(0) + '% corridor' : 'corridor unknown'}`,
          ),
        );
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
        el('td', r.land.parcelCount + (r.land.truncated ? '+' : '')),
        el('td', r.land.unknownParcels ?? 'Unavailable'),
        el('td', money(r.hydraulics?.annualCost)),
        el('td', (r.land.coverage * 100).toFixed(1) + '%'),
      );
      tbody.append(tr);
    }
    table.append(tbody);
    const tableScroll = el('div');
    tableScroll.className = 'pp-table-scroll';
    tableScroll.append(table);
    box.append(tableScroll, method);
    draw();
    renderDetail();
    panel.querySelector('[data-export]').disabled = !selected;
    setStage(stage);
  }
  function renderDetail() {
    const box = panel.querySelector('[data-detail]');
    box.replaceChildren();
    const r = routes.find((v) => v.id === selected);
    if (!r) return;
    box.append(el('h3', r.name + ' · corridor review'));
    const facts = r.routing;
    const roadsAvailable = infrastructure?.sources[1]?.status === 'available';
    const pipelinesAvailable =
      infrastructure?.sources[0]?.status === 'available';
    if (facts) {
      box.append(
        el(
          'p',
          `${pipelinesAvailable ? facts.followingPct.toFixed(1) + '%' : 'Unknown share'} parallel to preferred mapped pipelines · ${facts.scoreKm.toFixed(1)} cost-equivalent km under your preferences (not a dollar estimate).`,
        ),
      );
      box.append(
        el(
          'p',
          `${roadsAvailable ? facts.counts.majorRoad : 'Unknown'} highway · ${roadsAvailable ? facts.counts.road : 'unknown'} other road · ${roadsAvailable ? facts.counts.rail : 'unknown'} rail · ${roadsAvailable ? facts.counts.water : 'unknown'} waterway crossing events. Nearby intersections within 10 m are grouped; divided roads may produce multiple events.`,
        ),
      );
      const crossings = el('details');
      crossings.append(el('summary', 'Mapped crossings to review'));
      for (const x of facts.crossings) {
        const button = el(
          'button',
          `${x.kind} · ${x.name} · ${x.point[1].toFixed(5)}, ${x.point[0].toFixed(5)}`,
        );
        button.type = 'button';
        button.addEventListener('click', () => {
          data.entities.removeById('longhaul-selected-crossing');
          data.entities.add({
            id: 'longhaul-selected-crossing',
            position: Cesium.Cartesian3.fromDegrees(...x.point),
            point: {
              pixelSize: 15,
              color: Cesium.Color.WHITE,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 3,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Infinity,
            },
          });
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(...x.point, 3500),
            duration: 1.2,
          });
          status(
            `Selected mapped ${x.kind} crossing: ${x.name}. Source: routing infrastructure inventory; not a surveyed crossing.`,
          );
        });
        crossings.append(button);
      }
      box.append(crossings);
    }
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
    const engineering = el('details');
    engineering.append(el('summary', 'Hydraulics, crossings & terrain'));
    for (const child of [...box.children].slice(1)) engineering.append(child);
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
        `Owner profiles (${r.land.ownerCount ?? 'unknown'} recorded names) · parcel research (${r.land.unknownParcels ?? 'unknown'})`,
      ),
    );
    const list = el('div');
    list.className = 'pp-owner-list';
    for (const o of r.land.owners.filter(
      (o) => o.owner_key !== 'OWNER NOT SUPPLIED',
    )) {
      const row = el('div');
      const ownerButton = el('button', o.name);
      ownerButton.type = 'button';
      ownerButton.addEventListener('click', () =>
        document.dispatchEvent(
          new CustomEvent('landman:owner', {
            detail: {
              subject: 'owner:' + o.owner_key,
              parcels: o.parcel_ids,
              from: 'pipeline-panel',
              name: o.name,
            },
          }),
        ),
      );
      row.append(
        ownerButton,
        el('small', `${o.parcels} parcels · ${o.counties.join(', ')}`),
      );
      list.append(row);
    }
    for (const p of r.land.unresolved || []) {
      const b = el(
        'button',
        `Research unknown ownership · parcel ${p.id} · ${p.county}`,
      );
      b.type = 'button';
      b.addEventListener('click', () =>
        document.dispatchEvent(
          new CustomEvent('landman:owner', {
            detail: { subject: 'parcel:' + p.id, from: 'pipeline-panel' },
          }),
        ),
      );
      list.append(b);
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
    box.append(engineering, sources);
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
  on('[data-waypoints]', 'input', () => {
    stop();
    invalidate();
  });
  for (const n of panel.querySelectorAll('[data-route]'))
    n.addEventListener('input', invalidate, { signal: lifetime.signal });
  on('[data-show-context]', 'change', draw);
  on('[data-add-via]', 'click', () => {
    arm('via');
    controls();
  });
  on('[data-draw-exclusion]', 'click', () => {
    arm('exclusion');
    controls();
  });
  on('[data-undo-exclusion]', 'click', () => {
    drawing.pop();
    draw();
    panel.querySelector('[data-drawing]').textContent =
      `${drawing.length} vertices · finish with at least three.`;
  });
  on('[data-finish-exclusion]', 'click', () => {
    try {
      validateExclusions([...exclusions, drawing]);
      exclusions.push(drawing);
      drawing = [];
      stop();
      controls();
      invalidate();
      panel.querySelector('[data-drawing]').textContent =
        'Exclusion saved. Routes cannot cross this area.';
    } catch (e) {
      panel.querySelector('[data-drawing]').textContent = e.message;
    }
  });
  for (const field of panel.querySelectorAll(
    '[data-a], [data-b], [data-input]:not([type="range"])',
  ))
    field.addEventListener(
      'input',
      () => {
        if (field.dataset.input) updateOperatingSummary();
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
    drawing = [];
    controls();
    draw();
    panel.querySelector('[data-drawing]').textContent =
      'Picking stopped; unfinished area discarded.';
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
        JSON.stringify({
          version: 2,
          a,
          b,
          inputs: readInputs(),
          operatingPreset: matchOperatingPreset(readInputs())?.id || null,
          preferences: routingInputs(),
          waypoints: readWaypoints(
            panel.querySelector('[data-waypoints]').value,
          ),
          exclusions,
        }),
      );
      status('Draft saved in this browser.');
    } catch (e) {
      status(e.message);
    }
  });
  on('[data-load]', 'click', () => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
      if (![1, 2].includes(d?.version))
        throw Error('No saved draft in this browser.');
      validateInputs(d.inputs);
      preferences = validateRouting(d.preferences || { ...ROUTING_DEFAULTS });
      exclusions = validateExclusions(d.exclusions || []);
      drawing = [];
      panel.querySelector('[data-waypoints]').value = (d.waypoints || [])
        .map((p) => p[1] + ', ' + p[0])
        .join('\n');
      readWaypoints(panel.querySelector('[data-waypoints]').value);
      for (const n of panel.querySelectorAll('[data-route]'))
        n.value = preferences[n.dataset.route];
      controls();
      for (const k of ['a', 'b']) {
        parseEndpoint(d[k][1] + ', ' + d[k][0]);
        panel.querySelector(`[data-${k}]`).value = d[k][1] + ', ' + d[k][0];
      }
      for (const n of panel.querySelectorAll('[data-input]'))
        n.value = d.inputs[n.dataset.input];
      updateOperatingSummary();
      panel.querySelector('[data-operating-details]').open =
        !matchOperatingPreset(d.inputs);
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
    exclusions = [];
    drawing = [];
    infrastructure = null;
    panel.querySelector('[data-waypoints]').value = '';
    controls();
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
                  operatingPreset: matchOperatingPreset(inputs) || null,
                  routingPreferences: preferences,
                  routing: r.routing,
                  exclusions,
                  waypoints: readWaypoints(
                    panel.querySelector('[data-waypoints]').value,
                  ),
                  infrastructureSources: infrastructure?.sources,
                  search: routingRun && {
                    bounds: routingRun.bounds,
                    resolutionM: routingRun.resolutionM,
                  },
                  hydraulics: r.hydraulics,
                  land: r.land,
                  limitations:
                    'Appraisal names are not verified legal parties or contracts. Energy only; no verified construction/ROW costs or transient/station design; finite-grid search using mapped crossing penalties and user exclusions.',
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
    a.download = 'LONG-Haul-produced-water-route.geojson';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') stop();
    },
    { signal: lifetime.signal },
  );
  setStage('setup');
  const picker = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  picker.setInputAction((event) => {
    if (!picking || document.body.dataset.pipelinePicking !== picking) return;
    const ray = viewer.camera.getPickRay(event.position),
      position = ray && viewer.scene.globe.pick(ray, viewer.scene);
    if (!position) return;
    const c = Cesium.Cartographic.fromCartesian(position),
      which = picking;
    const lon = Cesium.Math.toDegrees(c.longitude),
      lat = Cesium.Math.toDegrees(c.latitude);
    if (which === 'exclusion') {
      if (drawing.length >= 50) {
        status('Maximum 50 vertices per exclusion.');
        return;
      }
      drawing.push([lon, lat]);
      invalidate();
      panel.querySelector('[data-drawing]').textContent =
        `${drawing.length} vertices · Finish area when ready.`;
      return;
    }
    if (which === 'via') {
      const field = panel.querySelector('[data-waypoints]');
      try {
        const points = readWaypoints(field.value);
        if (points.length >= 8)
          throw Error('Use up to eight required waypoints.');
        field.value +=
          (field.value.trim() ? '\n' : '') +
          `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        stop();
        controls();
        invalidate();
        panel.querySelector('[data-drawing]').textContent =
          'Waypoint added. Edit or reorder its coordinate line to change it.';
      } catch (e) {
        status(e.message);
      }
      return;
    }
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
