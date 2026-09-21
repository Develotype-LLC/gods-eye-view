import { mountLocationInvestigation } from './locationInvestigation.js';
import { mountPipelinePlanner } from './pipelinePlanner.js';
import * as Cesium from 'cesium';
import {
  LANDMAN_MODE_KEY,
  LANDMAN_LAYERS,
  LANDMAN_VIEWS,
  filterLandmanLayers,
  initialLandmanMode,
} from './landmanModel.js';
const element = (tag, text) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
};
const INSPECTORS = [
  'location-panel',
  'land-panel',
  'pipeline-panel',
  'texas-panel',
  'records-panel',
  'basins-panel',
  'ground-motion-legend',
  'injection-panel',
];
export function mountLandmanWorkspace({
  scene: { viewer },
  controls: { styleManager },
  data: { dataManager, catalog },
  signal,
}) {
  const records = catalog.get('reference-records');
  let landman = false,
    busy = false,
    disposed = false,
    currentInspector = null,
    visualBefore = null,
    otherLayers = [],
    preference = null,
    search = '',
    activeOnly = false,
    activeView = '',
    pending = Promise.resolve();
  try {
    preference = localStorage.getItem(LANDMAN_MODE_KEY);
  } catch {}
  const initial = initialLandmanMode({
    search: location.search,
    hostname: location.hostname,
    hasShareState: styleManager.hasShareState,
    preference,
  });
  const root = element('section');
  root.id = 'landman-workspace';
  root.setAttribute('aria-label', 'Landman workspace');
  root.hidden = true;
  root.innerHTML = `<header class="lm-topbar"><div class="lm-brand"><img src="/logo.svg" alt=""><div><strong>LANDMAN’S <em>Eye</em></strong><span>WELLS · WATER · LAND</span></div></div><nav aria-label="Workspace view"><button data-mode="landman" aria-pressed="true">Landman</button><button data-mode="console" aria-pressed="false">Full console ↗</button></nav><div class="lm-top-actions"><button data-region="texas">Texas</button><button data-region="permian">Permian</button><button data-region="us">US basins</button><button data-tilt>2D / 3D tilt</button><button data-mobile-layers aria-expanded="true">Layers</button></div></header>
 <aside class="lm-sidebar" aria-label="Landman layers"><div class="lm-sidebar-heading"><div><small>YOUR WORKSPACE</small><h2>Explore the basin</h2></div><span data-active-count>0 on</span></div>
 <div class="lm-view-picks" aria-label="Landman task views"></div><p class="lm-view-description" data-view-description>Start with a view, then choose the layers you need.</p>
 <button class="lm-compare-button" data-pipeline>LONG-Haul · pipeline routing</button>
 <button class="lm-compare-button" data-locations>Compare locations · A → B</button>
 <form data-well-search><label for="lm-api">Find a Texas well</label><div><input id="lm-api" placeholder="API-8 or API-10" inputmode="numeric" pattern="(42)?[0-9]{8}" required><button type="submit">Find</button></div></form>
 <div class="lm-layer-tools"><label><span class="lm-sr">Search layers</span><input data-layer-search placeholder="Search layers or sources…" type="search"></label><label class="lm-active-only"><input data-active-only type="checkbox">Active only</label></div>
 <div class="lm-layer-list"></div>
 <footer><button data-archive>Search RRC records</button><button data-sources>Source library ↗</button><p>Dated records and estimates keep their source labels.</p></footer></aside>
 <aside class="lm-inspector" aria-label="Landman inspector" hidden><header><div><small>INSPECTOR</small><h2 data-inspector-title>Layer details</h2></div><button data-close-inspector aria-label="Close inspector">✕</button></header><div class="lm-inspector-content"></div></aside>
 <div class="lm-map-note"><span class="lm-map-dot"></span><span data-map-note>Regional context · zoom in to inspect records</span></div><div class="lm-status" role="status" aria-live="polite" hidden></div>`;
  document.body.append(root);
  const launcher = element('button', 'Landman workspace ↗');
  launcher.id = 'open-landman-workspace';
  launcher.hidden = true;
  document.body.append(launcher);
  const abort = new AbortController(),
    on = (selector, type, fn) =>
      root
        .querySelector(selector)
        .addEventListener(type, fn, { signal: abort.signal });
  let investigation, pipeline;
  const status = root.querySelector('.lm-status'),
    list = root.querySelector('.lm-layer-list'),
    inspector = root.querySelector('.lm-inspector'),
    content = root.querySelector('.lm-inspector-content');
  function enabled(item) {
    return item.dataset
      ? dataManager.isEnabled('reference-records') &&
          records.getState().active.includes(item.id)
      : dataManager.isEnabled(item.id);
  }
  function message(text) {
    status.textContent = text;
    status.hidden = !text;
  }
  function action(fn) {
    pending = pending.then(async () => {
      if (disposed) return;
      busy = true;
      root.setAttribute('aria-busy', 'true');
      message('Updating your view…');
      try {
        await fn();
        message('');
      } catch (e) {
        message(e.message || 'Could not update this view. Try again.');
      } finally {
        busy = false;
        root.removeAttribute('aria-busy');
        render();
      }
    });
    return pending;
  }
  async function setLayer(item, on) {
    if (item.dataset) {
      if (on && !dataManager.isEnabled('reference-records')) {
        records.select(item.id);
        await dataManager.setEnabled('reference-records', true, {
          origin: 'user',
        });
        if (!dataManager.isEnabled('reference-records'))
          throw new Error('Reference data could not be enabled');
      }
      await records.toggle(item.id, on);
    } else {
      await dataManager.setEnabled(item.id, on, { origin: 'user' });
      if (on && !dataManager.isEnabled(item.id))
        throw new Error(item.name + ' could not be enabled');
    }
  }
  function dockPanels() {
    if (!landman) return;
    for (const id of INSPECTORS) {
      const panel = document.getElementById(id);
      if (panel && panel.parentElement !== content) content.append(panel);
    }
  }
  function setInspector(item, { select = true } = {}) {
    currentInspector = item
      ? item.dataset
        ? 'records-panel'
        : item.inspector
      : null;
    if (currentInspector !== 'location-panel') investigation?.stop();
    if (currentInspector !== 'pipeline-panel') pipeline?.stop();
    dockPanels();
    root.dataset.inspector = currentInspector || '';
    inspector.hidden = !currentInspector;
    root.classList.toggle('has-inspector', !!currentInspector);
    if (item) {
      root.querySelector('[data-inspector-title]').textContent = item.name;
      if (item.dataset && select) records.select(item.id);
    }
  }
  function render() {
    if (disposed) return;
    dockPanels();
    root.querySelector('[data-active-count]').textContent =
      LANDMAN_LAYERS.filter(enabled).length + ' on';
    const filtered = filterLandmanLayers(search, activeOnly, enabled);
    const signature = JSON.stringify([
      search,
      activeOnly,
      busy,
      filtered.map((item) => [item.id, enabled(item)]),
    ]);
    if (list.dataset.signature !== signature) {
      list.dataset.signature = signature;
      list.replaceChildren();
      for (const group of [...new Set(filtered.map((l) => l.group))]) {
        const section = element('section');
        section.className = 'lm-group';
        section.append(element('h3', group));
        for (const item of filtered.filter((l) => l.group === group)) {
          const row = element('div');
          row.className = 'lm-layer-row' + (enabled(item) ? ' is-on' : '');
          const toggle = element('button');
          toggle.className = 'lm-layer-toggle';
          toggle.setAttribute('role', 'switch');
          toggle.setAttribute('aria-checked', String(enabled(item)));
          toggle.setAttribute('aria-label', 'Show ' + item.name);
          toggle.style.setProperty('--layer-color', item.color);
          toggle.disabled = busy;
          toggle.addEventListener(
            'click',
            () =>
              void action(async () => {
                activeView = '';
                await setLayer(item, !enabled(item));
              }),
          );
          const info = element('button');
          info.className = 'lm-layer-info';
          info.setAttribute('aria-label', 'Explore ' + item.name);
          info.append(
            element('strong', item.name),
            element('small', item.source),
          );
          info.disabled = busy;
          info.addEventListener(
            'click',
            () =>
              void action(async () => {
                await setLayer(item, true);
                setInspector(item);
                if (item.dataset) records.flyTo(item.id);
                else catalog.get(item.id).flyTo?.();
              }),
          );
          const tag = element('span', item.tag);
          tag.className = 'lm-layer-tag';
          row.append(toggle, info, tag);
          section.append(row);
        }
        list.append(section);
      }
      if (!filtered.length)
        list.append(
          element(
            'p',
            'No matching layers. Try a different source or clear Active only.',
          ),
        );
    }
    for (const button of root.querySelectorAll('[data-view]')) {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.view === activeView),
      );
      button.disabled = busy;
    }
  }
  function fly(bounds) {
    viewer.camera.cancelFlight();
    viewer.camera.flyTo({
      destination: Cesium.Rectangle.fromDegrees(...bounds),
      duration: 1.5,
    });
  }
  async function preset(view) {
    activeView = view.id;
    setInspector(null);
    for (const item of LANDMAN_LAYERS)
      if (enabled(item) && !view.layers.includes(item.id))
        await setLayer(item, false);
    for (const id of view.layers)
      await setLayer(
        LANDMAN_LAYERS.find((l) => l.id === id),
        true,
      );
    if (view.id === 'et') {
      records.select('openet');
      records.setPeriod('2018-07');
    }
    if (view.inspector)
      setInspector(LANDMAN_LAYERS.find((l) => l.id === view.inspector));
    root.querySelector('[data-view-description]').textContent =
      view.description;
    root.querySelector('[data-map-note]').textContent = view.description;
    fly(view.bounds);
  }
  async function mode(on, { startup = false } = {}) {
    if (on === landman) return;
    if (on) {
      visualBefore = styleManager.getVisualState();
      otherLayers = dataManager
        .getAll()
        .filter(
          (l) =>
            dataManager.isEnabled(l.id) &&
            ![
              'reference-records',
              ...LANDMAN_LAYERS.filter((l) => !l.dataset).map((l) => l.id),
            ].includes(l.id),
        )
        .map((l) => l.id);
      await styleManager.setContextMode?.(null);
      for (const id of otherLayers)
        await dataManager.setEnabled(id, false, { origin: 'programmatic' });
      await styleManager.applyVisualState({
        style: 'normal',
        hud: { visible: false },
        detection: { mode: 'OFF' },
        scope: { enabled: false },
      });
      landman = true;
      document.body.classList.add('landman-mode');
      root.hidden = false;
      launcher.hidden = true;
      dockPanels();
      if (startup && !styleManager.hasShareState) {
        await new Promise((resolve) => setTimeout(resolve, 650));
        if (!disposed) await preset(LANDMAN_VIEWS[0]);
      }
    } else {
      investigation?.stop();
      pipeline?.stop();
      landman = false;
      document.body.classList.remove('landman-mode');
      root.hidden = true;
      launcher.hidden = false;
      for (const id of INSPECTORS) {
        const panel = document.getElementById(id);
        if (panel?.parentElement === content) document.body.append(panel);
      }
      if (visualBefore) {
        const state = { ...visualBefore };
        delete state.mapStack;
        await styleManager.applyVisualState(state);
      }
      for (const id of otherLayers)
        await dataManager.setEnabled(id, true, { origin: 'programmatic' });
    }
    if (on || !startup) {
      try {
        localStorage.setItem(LANDMAN_MODE_KEY, on ? 'landman' : 'console');
      } catch {}
      const url = new URL(location.href);
      url.searchParams.set('view', on ? 'landman' : 'console');
      history.replaceState(history.state, '', url);
    }
    render();
  }
  for (const view of LANDMAN_VIEWS) {
    const b = element('button', view.name);
    b.dataset.view = view.id;
    b.title = view.description;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => void action(() => preset(view)), {
      signal: abort.signal,
    });
    root.querySelector('.lm-view-picks').append(b);
  }
  on('[data-mode="console"]', 'click', () => void action(() => mode(false)));
  on('[data-mode="landman"]', 'click', () => {});
  launcher.addEventListener('click', () => void action(() => mode(true)), {
    signal: abort.signal,
  });
  on('[data-mobile-layers]', 'click', (e) => {
    const collapsed = root.classList.toggle('layers-collapsed');
    e.currentTarget.setAttribute('aria-expanded', String(!collapsed));
  });
  for (const [id, bounds] of Object.entries({
    texas: [-106.7, 25.7, -93.4, 36.6],
    permian: [-105, 30, -100.5, 34],
    us: [-125, 24, -66, 50],
  }))
    on('[data-region="' + id + '"]', 'click', () => fly(bounds));
  on('[data-tilt]', 'click', () =>
    document.getElementById('tilt-map-view')?.click(),
  );
  on('[data-close-inspector]', 'click', () => {
    investigation.stop();
    setInspector(null);
  });
  on('[data-locations]', 'click', () => investigation.open());
  on('[data-pipeline]', 'click', () => pipeline.open());
  on('[data-layer-search]', 'input', (e) => {
    search = e.target.value;
    render();
  });
  on('[data-active-only]', 'change', (e) => {
    activeOnly = e.target.checked;
    render();
  });
  on('[data-well-search]', 'submit', (e) => {
    e.preventDefault();
    void action(async () => {
      let api = root.querySelector('#lm-api').value.trim();
      if (api.length === 10) api = api.slice(2);
      const item = LANDMAN_LAYERS[0];
      await setLayer(item, true);
      setInspector(item);
      await catalog.get('texas-wells').search(api);
    });
  });
  on(
    '[data-archive]',
    'click',
    () =>
      void action(async () => {
        records.select('rrc-records');
        await dataManager.setEnabled('reference-records', true, {
          origin: 'user',
        });
        setInspector({
          dataset: true,
          id: 'rrc-records',
          name: 'Downloaded RRC records',
        });
        await records.searchArchive({});
      }),
  );
  on('[data-sources]', 'click', () =>
    document.getElementById('open-reference-library')?.click(),
  );
  document.addEventListener(
    'landman:inspect',
    (event) => {
      if (!landman) return;
      const { layerId, datasetId, name } = event.detail;
      const item = LANDMAN_LAYERS.find(
        (l) => l.id === (datasetId || layerId),
      ) || { id: layerId, inspector: 'injection-panel', name };
      setInspector(item, { select: false });
    },
    { signal: abort.signal },
  );
  investigation = mountLocationInvestigation({
    viewer,
    dataManager,
    catalog,
    openInspector: setInspector,
  });
  pipeline = mountPipelinePlanner({ viewer, openInspector: setInspector });
  let previousDetail = null,
    previousArchive = null,
    previousTexas = null;
  const offActivity = dataManager.subscribeActivity(render),
    offRecords = records.subscribe(() => {
      const state = records.getState();
      if (
        landman &&
        ((state.detail && state.detail !== previousDetail) ||
          (state.archive && state.archive !== previousArchive))
      ) {
        setInspector(
          LANDMAN_LAYERS.find((l) => l.id === state.selected) || {
            dataset: true,
            id: 'rrc-records',
            name: 'Downloaded RRC records',
          },
          { select: false },
        );
      }
      previousDetail = state.detail;
      previousArchive = state.archive;
      render();
    });
  const offTexas = catalog.get('texas-wells').subscribe(() => {
    const detail = catalog.get('texas-wells').getState().detail;
    if (landman && detail && detail !== previousTexas)
      setInspector(LANDMAN_LAYERS[0]);
    previousTexas = detail;
  });
  // Source-library actions still use the shared inspector in this workspace.
  const observer = new MutationObserver(() => {
    if (landman) dockPanels();
  });
  observer.observe(document.body, { childList: true });
  void Promise.resolve(styleManager.initialRestorePromise)
    .catch(() => {})
    .then(() => {
      if (disposed || signal.aborted) return;
      launcher.hidden = initial;
      return action(() => mode(initial, { startup: initial }));
    });
  render();
  return () => {
    disposed = true;
    investigation.destroy();
    pipeline.destroy();
    abort.abort();
    offActivity();
    offRecords();
    offTexas();
    observer.disconnect();
    document.body.classList.remove('landman-mode');
    for (const id of INSPECTORS) {
      const p = document.getElementById(id);
      if (p?.parentElement === content) document.body.append(p);
    }
    root.remove();
    launcher.remove();
  };
}
