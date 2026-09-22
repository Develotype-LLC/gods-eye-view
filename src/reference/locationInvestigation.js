import * as Cesium from 'cesium';
import { heightDifference, containsPoint } from './locationModel.js';
import { LANDMAN_LAYERS } from './landmanModel.js';
const node = (tag, text) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = String(text);
  return e;
};
const number = (value, unit = 'm') =>
  Number.isFinite(value)
    ? `${value > 0 ? '+' : ''}${value.toFixed(1)} ${unit}`
    : 'Unavailable';
const coords = (p) =>
  p ? `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}` : 'Not selected';
export function mountLocationInvestigation({
  viewer,
  dataManager,
  catalog,
  openInspector,
}) {
  const terrain = catalog.get('terrain-difference'),
    motion = catalog.get('ground-motion'),
    records = catalog.get('reference-records');
  const panel = node('section');
  panel.id = 'location-panel';
  panel.innerHTML = `<p>Choose a starting point A, then click anywhere for point B. Compare elevation and inspect the layers currently shown.</p>
 <div class="li-actions"><button data-set-a>Set starting point A</button><button data-set-b disabled>Inspect point B</button><button data-stop>Stop picking</button><button data-clear>Clear</button></div>
 <p data-pick-status role="status"></p><div class="li-coordinates"><label>Or enter a location (latitude, longitude)<input data-coordinates placeholder="31.4007, -102.6049" aria-label="Comparison coordinates"></label><button data-use-coordinates>Use coordinates</button></div>
 <div data-comparison></div>
 <label><input data-terrain type="checkbox">Terrain elevation heat map</label><label>Elevation color range<select data-range><option value="25">±25 m</option><option value="100" selected>±100 m</option><option value="500">±500 m</option><option value="2000">±2,000 m</option></select></label>
 <p class="li-ramp"></p><p data-terrain-legend></p>
 <p data-overlap hidden>Both heat maps are on; their colors blend. Turn one off to read its color scale independently.</p>
 <label>Nearby search radius<select data-radius><option value="100">100 m</option><option value="500" selected>500 m</option><option value="1000">1 km</option><option value="5000">5 km</option></select></label>
 <div data-facts></div><p class="li-method">Terrain uses modelled WGS84 ellipsoidal height, not a survey or sea-level datum. Satellite values are historical line-of-sight rates, not vertical terrain heights. Nearby records do not establish ownership, connectivity or causation.</p>`;
  document.body.append(panel);
  const abort = new AbortController();
  let a = null,
    b = null,
    picking = null,
    intent = 0,
    request = null,
    disposed = false,
    basinsPromise = null,
    timer,
    signature = '',
    lastVariant = motion.getState().variantId;
  const markers = new Cesium.CustomDataSource('Landman comparison points');
  let added = false;
  const on = (selector, event, fn) =>
    panel
      .querySelector(selector)
      .addEventListener(event, fn, { signal: abort.signal });
  const status = (text) =>
    (panel.querySelector('[data-pick-status]').textContent = text);
  const open = () =>
    openInspector({
      id: 'terrain-difference',
      inspector: 'location-panel',
      name: 'Location comparison',
    });
  function arm(which = 'b') {
    picking = which;
    document.body.dataset.locationPicking = 'true';
    status(
      which === 'a'
        ? 'Click the map to set reference point A.'
        : 'Click the map to inspect point B.',
    );
    open();
  }
  function stop() {
    intent++;
    request?.abort();
    picking = null;
    delete document.body.dataset.locationPicking;
    status('Picking paused. Your comparison remains visible.');
  }
  async function json(path, signal) {
    const r = await fetch(path, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
    });
    if (!r.ok) throw new Error(`Data request failed (${r.status})`);
    return r.json();
  }
  async function elevation(point, signal) {
    const data = await json(
      '/api/terrain/heights?' +
        new URLSearchParams({
          points: `${point.longitude.toFixed(5)},${point.latitude.toFixed(5)}`,
        }),
      signal,
    );
    const row = data.results?.[0];
    if (!Number.isFinite(row?.ellipsoid))
      throw new Error('No valid terrain height at this point');
    return { ...point, ellipsoid: row.ellipsoid };
  }
  function draw() {
    if (!added) {
      added = true;
      void viewer.dataSources.add(markers);
    }
    markers.entities.removeAll();
    for (const [name, p, color] of [
      ['A', a, Cesium.Color.CYAN],
      ['B', b, Cesium.Color.YELLOW],
    ])
      if (p)
        markers.entities.add({
          id: 'landman-point-' + name,
          position: Cesium.Cartesian3.fromDegrees(p.longitude, p.latitude),
          point: {
            pixelSize: 14,
            color,
            outlineWidth: 2,
            outlineColor: Cesium.Color.BLACK,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Infinity,
          },
          label: {
            text: name,
            font: 'bold 18px sans-serif',
            pixelOffset: new Cesium.Cartesian2(0, -24),
            fillColor: color,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Infinity,
          },
        });
    viewer.scene.requestRender();
  }
  function summary() {
    const box = panel.querySelector('[data-comparison]');
    box.replaceChildren(
      node('h3', 'A → B'),
      node('p', 'A · ' + coords(a)),
      node('p', 'B · ' + coords(b)),
    );
    if (a) box.append(node('p', 'A terrain height · ' + number(a.ellipsoid)));
    if (b) box.append(node('p', 'B terrain height · ' + number(b.ellipsoid)));
    if (a && b) {
      const d = heightDifference(a.ellipsoid, b.ellipsoid);
      box.append(
        node(
          'strong',
          d === null
            ? 'Elevation difference unavailable'
            : `${number(d)} · B is ${d > 0 ? 'higher than' : d < 0 ? 'lower than' : 'level with'} A`,
        ),
      );
      const distance = new Cesium.EllipsoidGeodesic(
        Cesium.Cartographic.fromDegrees(a.longitude, a.latitude),
        Cesium.Cartographic.fromDegrees(b.longitude, b.latitude),
      ).surfaceDistance;
      box.append(
        node('p', `Surface distance · ${(distance / 1000).toFixed(2)} km`),
      );
    }
    panel.querySelector('[data-set-b]').disabled = !a;
  }
  function sync() {
    panel.querySelector('[data-terrain]').checked =
      dataManager.isEnabled('terrain-difference');
    const t = terrain.getState();
    panel.querySelector('[data-overlap]').hidden = !(
      dataManager.isEnabled('terrain-difference') &&
      dataManager.isEnabled('ground-motion')
    );
    panel.querySelector('[data-terrain-legend]').textContent =
      a && Number.isFinite(a.ellipsoid)
        ? `Blue: lower · cream: same height · red: higher than A. Scale −${t.range} to +${t.range} m; extremes saturate. Detail follows terrain mesh resolution.`
        : 'Set point A with a valid terrain height to color the terrain.';
  }
  function factsCard(title, note) {
    const card = node('section');
    card.className = 'li-fact-card';
    card.append(node('h4', title), node('p', note));
    panel.querySelector('[data-facts]').append(card);
    return card;
  }
  function describeProperties(container, properties) {
    const entries = Object.entries(properties || {})
      .filter(([, v]) => v !== null && typeof v !== 'object')
      .slice(0, 8);
    if (!entries.length) return;
    const details = node('details'),
      dl = node('dl');
    details.append(node('summary', 'Source facts'));
    for (const [k, v] of entries)
      dl.append(node('dt', k.replaceAll('_', ' ')), node('dd', v));
    details.append(dl);
    container.append(details);
  }
  async function inspectFacts(token, signal) {
    const point = b,
      base = {
        longitude: point.longitude,
        latitude: point.latitude,
        radius: panel.querySelector('[data-radius]').value,
      };
    const facts = panel.querySelector('[data-facts]');
    facts.replaceChildren(
      node('h3', 'Shown layers near B'),
      node(
        'p',
        `Within ${base.radius} m. Up to five nearest records per layer; counts include all matches. Polygon containment is identified separately.`,
      ),
    );
    const jobs = [];
    const add = (title, job, render) => {
      const card = factsCard(title, 'Loading…');
      jobs.push(
        (async () => {
          try {
            const result = await job();
            if (token !== intent || signal.aborted) return;
            card.replaceChildren(node('h4', title));
            render(card, result);
          } catch (e) {
            if (token !== intent || signal.aborted) return;
            card.replaceChildren(
              node('h4', title),
              node(
                'p',
                'Unavailable for this location. Retry by clicking B again.',
              ),
            );
          }
        })(),
      );
    };
    if (dataManager.isEnabled('terrain-difference')) {
      const card = factsCard(
        'Terrain elevation',
        Number.isFinite(point.ellipsoid)
          ? `${number(point.ellipsoid)} ellipsoidal height; B − A ${number(heightDifference(a?.ellipsoid, point.ellipsoid))}.`
          : 'Terrain height unavailable.',
      );
      card.append(
        node('small', 'Re:Earth terrain-height service · modelled terrain'),
      );
    }
    if (dataManager.isEnabled('ground-motion'))
      add(
        'Satellite ground movement',
        async () => ({
          atB: await motion.sample(point.longitude, point.latitude),
          atA: a ? await motion.sample(a.longitude, a.latitude) : null,
        }),
        (card, d) => {
          card.append(
            node(
              'p',
              d.atB.status === 'value'
                ? `B LOS velocity: ${number(d.atB.value, 'mm/year')}`
                : d.atB.status === 'history'
                  ? 'Open Ground movement to read this location’s US time series. The national overview is long-term velocity; A-relative coloring is available in the Crane archive.'
                  : d.atB.status === 'outside'
                    ? 'B is outside the installed OPERA snapshot.'
                    : 'B is a no-data pixel.',
            ),
          );
          if (d.atB.status === 'value' && d.atA?.status === 'value')
            card.append(
              node(
                'p',
                `B − A: ${number(d.atB.value - d.atA.value, 'mm/year')} · relative LOS velocity`,
              ),
            );
          card.append(
            node(
              'small',
              (d.atB.status === 'history'
                ? 'NASA OPERA / ASF · '
                : 'NASA OPERA · 2016–2025 · ') + d.atB.variant,
            ),
          );
        },
      );
    if (dataManager.isEnabled('us-basins'))
      add(
        'Geological basins',
        async () => {
          basinsPromise ??= fetch(
            '/reference-data/basins/usgs-basins.geojson',
            { signal: abort.signal },
          )
            .then((r) => {
              if (!r.ok) throw Error('Basin snapshot unavailable');
              return r.json();
            })
            .catch((e) => {
              basinsPromise = null;
              throw e;
            });
          const d = await basinsPromise;
          return d.features.filter((f) =>
            containsPoint(f.geometry, [point.longitude, point.latitude]),
          );
        },
        (card, features) => {
          const seen = new Set();
          for (const f of features) {
            const p = f.properties;
            if (seen.has(p.OBJECTID)) continue;
            seen.add(p.OBJECTID);
            card.append(node('strong', p.name));
            describeProperties(card, p);
          }
          if (!seen.size)
            card.append(
              node(
                'p',
                'No containing polygon in the installed USGS snapshot.',
              ),
            );
          card.append(
            node(
              'small',
              'USGS regional boundaries · not lease or formation limits',
            ),
          );
        },
      );
    const renderRecords = (card, d, item) => {
      card.append(
        node(
          'p',
          `${d.total.toLocaleString()} records within ${base.radius} m`,
        ),
        node('small', d.source || item.source),
        node('p', d.note),
      );
      for (const f of d.features) {
        const row = node('div');
        row.className = 'li-record';
        row.append(
          node(
            'strong',
            f.name ||
              `API ${f.api8 || 'unavailable'} · ${f.category || 'Well'} `,
          ),
          node(
            'p',
            f.contains_point
              ? 'Selected point is inside this polygon'
              : `${Math.round(f.distance_m)} m from B`,
          ),
        );
        if (f.value !== null && f.value !== undefined)
          row.append(
            node(
              'p',
              `${d.kind}: ${Number(f.value).toFixed(1)} mm/month · ${d.period}`,
            ),
          );
        describeProperties(row, f.properties);
        const button = node('button', 'Open source record');
        button.addEventListener('click', () => {
          stop();
          if (item.dataset) {
            records.select(item.id);
            void records.loadDetail(item.id, f.key);
          } else void catalog.get('texas-wells').inspectId(f.id);
        });
        row.append(button);
        card.append(row);
      }
    };
    if (dataManager.isEnabled('texas-wells'))
      add(
        'Texas wells',
        () =>
          json(
            '/api/reference/texas/inspect?' +
              new URLSearchParams({
                ...base,
                category: catalog.get('texas-wells').getState().category || '',
              }),
            signal,
          ),
        (card, d) => renderRecords(card, d, LANDMAN_LAYERS[0]),
      );
    if (dataManager.isEnabled('reference-records'))
      for (const id of records.getState().active) {
        const item = LANDMAN_LAYERS.find((l) => l.id === id);
        if (!item) continue;
        add(
          item.name,
          () =>
            json(
              '/api/reference/records/inspect?' +
                new URLSearchParams({
                  ...base,
                  dataset: id,
                  ...records.getFilters(id),
                }),
              signal,
            ),
          (card, d) => renderRecords(card, d, item),
        );
      }
    if (dataManager.isEnabled('land-parcels'))
      add(
        'Land ownership at B',
        () =>
          json(
            '/api/reference/land/inspect?' + new URLSearchParams(base),
            signal,
          ),
        (card, d) => {
          card.append(node('p', d.note));
          if (!d.parcels.length)
            card.append(
              node(
                'p',
                'No containing parcel in imported coverage. Ownership is unknown here.',
              ),
            );
          for (const p of d.parcels) {
            card.append(
              node('strong', p.owner || 'Owner unresolved'),
              node(
                'p',
                `${p.county} · parcel ${p.source_key} · ${Number(p.area_acres).toFixed(1)} acres · contains B`,
              ),
            );
            const button = node('button', 'Open parcel facts');
            button.addEventListener('click', () => {
              stop();
              document.dispatchEvent(
                new CustomEvent('landman:parcel', { detail: { id: p.id } }),
              );
            });
            card.append(button);
          }
          if (d.truncated)
            card.append(
              node(
                'p',
                'First 20 containing parcels shown; overlapping source records need review.',
              ),
            );
        },
      );
    const unsupported = dataManager
      .getAll()
      .filter(
        (l) =>
          dataManager.isEnabled(l.id) &&
          ![
            'terrain-difference',
            'ground-motion',
            'us-basins',
            'texas-wells',
            'reference-records',
            'land-parcels',
          ].includes(l.id),
      );
    for (const layer of unsupported)
      factsCard(
        layer.name || layer.id,
        'This visible console layer has no location-inspection adapter yet. Use Full console for its details.',
      );
    if (
      !jobs.length &&
      !dataManager.isEnabled('terrain-difference') &&
      !unsupported.length
    )
      facts.append(node('p', 'Turn on layers to include their facts here.'));
    await Promise.all(jobs);
  }
  async function choose(
    point,
    which = picking || (!a ? 'a' : 'b'),
    reveal = true,
  ) {
    const token = ++intent;
    request?.abort();
    request = new AbortController();
    const signal = request.signal;
    if (which === 'a') {
      a = point;
      b = null;
      terrain.setReference(null);
      panel.querySelector('[data-facts]').replaceChildren();
    } else {
      b = point;
      panel
        .querySelector('[data-facts]')
        .replaceChildren(node('p', 'Loading facts for ' + coords(point) + '…'));
    }
    draw();
    summary();
    status('Reading terrain height…');
    if (reveal) open();
    try {
      const value = await elevation(point, signal);
      if (token !== intent) return;
      if (which === 'a') a = value;
      else b = value;
    } catch (e) {
      if (token !== intent || signal.aborted) return;
      status(
        'Terrain height unavailable; source-layer facts can still be inspected.',
      );
    }
    if (token !== intent || disposed) return;
    if (which === 'a') {
      terrain.setReference(Number.isFinite(a.ellipsoid) ? a : null);
      arm('b');
    } else {
      status('Point B selected. Click another location to investigate.');
      await inspectFacts(token, signal);
    }
    summary();
    sync();
  }
  on('[data-set-a]', 'click', () => arm('a'));
  on('[data-set-b]', 'click', () => arm('b'));
  on('[data-stop]', 'click', stop);
  on('[data-clear]', 'click', () => {
    intent++;
    request?.abort();
    a = b = null;
    terrain.setReference(null);
    markers.entities.removeAll();
    stop();
    summary();
    sync();
    panel.querySelector('[data-facts]').replaceChildren();
  });
  on('[data-use-coordinates]', 'click', () => {
    const raw = panel.querySelector('[data-coordinates]').value.split(',');
    const [latitude, longitude] = raw.map(Number);
    if (
      raw.length !== 2 ||
      raw.some((v) => !v.trim()) ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 85 ||
      Math.abs(longitude) > 180
    ) {
      status('Enter latitude, longitude; latitude must be between −85 and 85.');
      return;
    }
    arm(picking || (!a ? 'a' : 'b'));
    void choose({ latitude, longitude });
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, 12000),
      duration: 1.2,
    });
  });
  on('[data-terrain]', 'change', async (e) => {
    const wanted = e.target.checked;
    try {
      await dataManager.setEnabled('terrain-difference', wanted, {
        origin: 'user',
      });
      if (wanted && !a) arm('a');
    } catch (err) {
      status(err.message);
    }
    sync();
  });
  on('[data-range]', 'change', (e) => terrain.setRange(Number(e.target.value)));
  on('[data-radius]', 'change', () => {
    if (b) void choose({ ...b }, 'b', false);
  });
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((event) => {
    if (!picking || !document.body.classList.contains('landman-mode')) return;
    const ray = viewer.camera.getPickRay(event.position);
    const position = ray && viewer.scene.globe.pick(ray, viewer.scene);
    if (!position) {
      status('Click on terrain, not the sky.');
      return;
    }
    const c = Cesium.Cartographic.fromCartesian(position);
    void choose({
      longitude: Cesium.Math.toDegrees(c.longitude),
      latitude: Cesium.Math.toDegrees(c.latitude),
    });
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  function filtersChanged() {
    sync();
    const next = JSON.stringify([
      dataManager
        .getAll()
        .filter((l) => dataManager.isEnabled(l.id))
        .map((l) => l.id),
      records.getState().active.map((id) => [id, records.getFilters(id)]),
      catalog.get('texas-wells').getState().category,
    ]);
    if (next === signature) return;
    signature = next;
    if (b) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!disposed && b) void choose({ ...b }, 'b', false);
      }, 250);
    }
  }
  const subscriptions = [
    dataManager.subscribeActivity(filtersChanged),
    records.subscribe(filtersChanged),
    catalog.get('texas-wells').subscribe(filtersChanged),
    terrain.subscribe(sync),
    motion.subscribe(() => {
      sync();
      const variant = motion.getState().variantId;
      if (variant !== lastVariant) {
        lastVariant = variant;
        if (b) void choose({ ...b }, 'b', false);
      }
    }),
  ];
  summary();
  sync();
  return {
    open() {
      open();
      if (!a) arm('a');
    },
    stop,
    destroy() {
      disposed = true;
      intent++;
      abort.abort();
      request?.abort();
      clearTimeout(timer);
      subscriptions.forEach((fn) => fn());
      handler.destroy();
      delete document.body.dataset.locationPicking;
      if (added && !viewer.isDestroyed())
        viewer.dataSources.remove(markers, true);
      panel.remove();
    },
  };
}
