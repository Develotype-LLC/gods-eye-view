import * as Cesium from 'cesium';
import { REFERENCE_CATALOG } from './catalog.js';

export function mountReferenceLibrary({viewer, dataManager, layer, catalog}) {
  const trigger = document.getElementById('open-reference-library');
  if (!trigger || !layer) return () => {};
  const dialog = document.createElement('dialog');
  dialog.id = 'reference-library';
  dialog.setAttribute('aria-labelledby', 'reference-title');
  dialog.innerHTML = `<header><div><small>DEVELOTYPE · GEOSPATIAL WORKSPACE</small><h2 id="reference-title">Reference layers</h2></div><button data-close aria-label="Close reference layers">✕</button></header>
    <p class="ref-intro">Satellite observations, wells, water and infrastructure. Every layer keeps its source, date and limits.</p>
    <div class="ref-workspace"><aside><label>Find a layer<input type="search" placeholder="Search sources or layers…"></label><nav aria-label="Reference layer catalog"></nav></aside><section class="ref-detail"></section></div>`;
  document.body.append(dialog);
  const legend = document.createElement('section');
  legend.id = 'ground-motion-legend'; legend.hidden = true;
  legend.setAttribute('aria-label', 'Ground movement legend');
  legend.innerHTML = `<header><strong>GROUND MOVEMENT</strong><button data-hide aria-label="Hide ground movement">✕</button></header><small>NASA OPERA · historical LOS velocity<br>2016-08-01 → 2025-12-30</small><label>Measurement<select data-variant><option value="displacement">Full displacement</option><option value="short_wavelength_displacement">Short wavelength</option></select></label><div class="ref-colorbar"></div><div class="ref-scale"><span>−30 · away</span><span>0</span><span>+30 · toward</span></div><small>mm/year · relative to satellite · colors saturate</small><label>Opacity<input data-opacity type="range" min="0" max="1" step="0.05" value="0.7"></label><p data-sample role="status">Click inside the colored area to sample a pixel.</p><button data-library>Sources & layer library</button>`;
  document.body.append(legend);
  const detail = dialog.querySelector('.ref-detail'), nav = dialog.querySelector('nav');
  const sample = legend.querySelector('[data-sample]');
  let selected = 'texas-wells', disposed = false, selection = 0, sampleIntent = 0;
  const abort = new AbortController();
  const on = (el, type, fn) => el.addEventListener(type, fn, {signal: abort.signal});
  const el = (tag, text, className) => {const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node;};
  const open = () => {if (!dialog.open) dialog.showModal();};
  on(trigger, 'click', event => {event.stopPropagation(); open();});
  on(dialog.querySelector('[data-close]'), 'click', () => dialog.close());
  on(dialog, 'close', () => trigger.focus());
  on(legend.querySelector('[data-library]'), 'click', open);
  on(legend.querySelector('[data-hide]'), 'click', () => dataManager.setEnabled('ground-motion', false, {origin: 'user'}).catch(error => {sample.textContent = error.message;}));
  on(legend.querySelector('[data-variant]'), 'change', async event => {
    sampleIntent++; sample.textContent = 'Click to sample this measurement.';
    try {await layer.setVariant(event.target.value);} catch (error) {sample.textContent = error.message; sync();}
  });
  on(legend.querySelector('[data-opacity]'), 'input', event => layer.setOpacity(Number(event.target.value)));
  function sync() {
    const state = layer.getState();
    legend.hidden = !dataManager.isEnabled('ground-motion');
    legend.querySelector('[data-variant]').value = state.variantId;
    legend.querySelector('[data-opacity]').value = state.opacity;
  }
  const unsubscribe = layer.subscribe(sync), unactivity = dataManager.subscribeActivity(sync);
  function list() {
    nav.replaceChildren();
    const query = dialog.querySelector('input[type=search]').value.toLowerCase();
    const entries = REFERENCE_CATALOG.filter(item => Object.values(item).join(' ').toLowerCase().includes(query));
    for (const item of entries) {
      const button = el('button', ''); button.className = item.id === selected ? 'selected' : '';
      button.setAttribute('aria-pressed', String(item.id === selected));
      button.append(el('strong', item.name), el('small', `${item.group} · ${item.status}`));
      button.addEventListener('click', () => {selected = item.id; list(); void showDetail(item);}); nav.append(button);
    }
    if (!entries.length) nav.append(el('p', 'No matching layers.'));
  }
  on(dialog.querySelector('input[type=search]'), 'input', list);
  async function showDetail(item) {
    const intent = ++selection;
    detail.replaceChildren(el('span', item.status, `ref-badge ${item.layerId ? 'available' : ''}`), el('h3', item.name), el('p', item.note));
    const dl = document.createElement('dl');
    for (const [title, value] of [['Source', item.source], ['Coverage', item.coverage], ['Data', item.format], ['Next step', item.next]]) dl.append(el('dt', title), el('dd', value));
    detail.append(dl);
    const link = el('a', 'Open source documentation ↗'); link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; detail.append(link);
    if (!item.layerId) {detail.append(el('p', item.status === 'On disk' ? 'Source artifacts exist in HeavenWatch. They still need an import and quality review before they can be displayed here.' : 'Roadmap item — this layer is not connected yet.', 'ref-note')); return;}
    if (item.layerId === 'texas-wells') {
      const texasLayer = catalog.get('texas-wells');
      const status = el('p', 'Reading statewide database…', 'ref-note'); detail.append(status);
      try {
        const data = await texasLayer.readStatus(); if (disposed || selection !== intent) return;
        status.textContent = data.datasets.map(d => `${d.name === 'gis' ? 'GIS well locations' : 'UIC permits'}: ${Number(d.row_count).toLocaleString()} · imported ${new Date(d.completed_at).toLocaleString()}`).join(' / ');
        const view = el('button', 'Explore all Texas wells', 'ref-primary'); view.addEventListener('click', async () => {
          view.disabled = true;
          try {await dataManager.setEnabled('injection-wells', false, {origin: 'user'}); await dataManager.setEnabled('texas-wells', true, {origin: 'user'}); if (!dataManager.isEnabled('texas-wells')) throw new Error('Texas layer could not be enabled'); texasLayer.flyTo(); dialog.close();}
          catch (error) {status.textContent = error.message;} finally {view.disabled = false;}
        }); detail.append(view, el('p', 'Zoom through clusters, filter RRC GIS classifications, or search a Texas API number. Selecting a well shows its UIC permits. Disposal history is fetched by well and saved in the database; the entire statewide H-10 history is not preloaded.', 'ref-note'));
        detail.append(el('p', 'Statewide GIS and UIC inventories are complete source snapshots. Records without usable coordinates or valid API numbers remain in the database with their limitations. Oil/gas production history, ownership and leases require separate sources.'));
      } catch (error) {if (selection === intent) status.textContent = error.message;}
      return;
    }
    if (item.layerId === 'injection-wells') {
      const wellsLayer = catalog.get('injection-wells');
      const status = el('p', 'Connecting to Texas RRC…', 'ref-note'); detail.append(status);
      try {
        const data = await wellsLayer.readData();
        if (disposed || selection !== intent) return;
        status.textContent = `${data.wellCount} wells · ${data.historyWellCount} with history · ${data.recordCount.toLocaleString()} records · ${data.period.join(' → ')}`;
        detail.append(el('p', data.connection?.warning || (data.sourceRetrievedAt ? `Texas RRC refreshed ${new Date(data.sourceRetrievedAt).toLocaleString()}. Server cache: up to 6 hours. Reopen the app to load a newer snapshot; refresh is requested when the cache expires.` : 'Historical fallback archive; original retrieval date unavailable.'), 'ref-note'));
        const view = el('button', 'View disposal wells & history', 'ref-primary');
        view.addEventListener('click', async () => {
          view.disabled = true;
          try {await dataManager.setEnabled(item.layerId, true, {origin: 'user'}); if (!dataManager.isEnabled(item.layerId)) throw new Error('Well layer could not be enabled'); await wellsLayer.flyTo(); dialog.close();}
          catch (error) {status.textContent = error.message;} finally {view.disabled = false;}
        }); detail.append(view, el('p', 'Choose a reporting month, then click a marker or select an API-8 to inspect history. You can display these wells together with ground movement.', 'ref-note'));
        const limitations = document.createElement('ul'); for (const note of data.limitations) limitations.append(el('li', note)); detail.append(limitations);
        for (const source of data.sources) {const a = el('a', source.name + ' ↗'); a.href = source.url; a.target = '_blank'; a.rel = 'noopener'; detail.append(a, document.createElement('br'));}
      } catch (error) {if (selection === intent) status.textContent = error.message;}
      return;
    }
    const status = el('p', 'Loading snapshot…', 'ref-note'); detail.append(status);
    try {
      const m = await layer.readManifest();
      if (disposed || selection !== intent) return;
      status.textContent = `${m.title} · ${m.acquisitions} acquisitions · ${m.startDate} → ${m.endDate} · ${m.frame}`;
      detail.append(el('p', m.evidence), el('p', m.sign));
      const view = el('button', 'View ground movement on map', 'ref-primary');
      view.addEventListener('click', async () => {
        view.disabled = true;
        try {await dataManager.setEnabled(item.layerId, true, {origin: 'user'}); if (!dataManager.isEnabled(item.layerId)) throw new Error('Layer could not be enabled'); await layer.flyTo(); dialog.close(); sync();}
        catch (error) {status.textContent = error.message;} finally {view.disabled = false;}
      }); detail.append(view, el('p', 'Uses satellite terrain so the raster stays visible. Google 3D remains selectable from the map controls.', 'ref-note'));
      const nasa = el('button', 'Check NASA for latest acquisition'); nasa.dataset.checkNasa = '';
      const availability = el('p', 'NASA catalog checks are live; the displayed velocity is a processed historical snapshot.', 'ref-note'); availability.setAttribute('role', 'status');
      nasa.addEventListener('click', async () => {
        nasa.disabled = true; availability.textContent = 'Checking NASA Earthdata…';
        try {
          const response = await fetch('/api/reference/ground-motion/availability', {signal: abort.signal});
          const data = await response.json(); if (!response.ok) throw new Error(data.error || 'NASA check failed');
          const latest = data.latest.acquisitionDate.slice(0, 10);
          availability.textContent = `${data.collection} / ${data.frame}: latest acquisition ${latest}. Displayed through ${m.endDate}. ${latest > m.endDate ? 'Newer data is available for processing.' : 'The displayed end date matches or exceeds the catalog result.'} Checked ${new Date(data.checkedAt).toLocaleString()}.`;
        } catch (error) {availability.textContent = error.message;} finally {nasa.disabled = false;}
      }); detail.append(nasa, availability);
      const methods = document.createElement('details'); methods.append(el('summary', 'Method, quality and limitations'), el('p', m.method), el('p', m.quality));
      const ul = document.createElement('ul'); for (const limit of m.limitations) ul.append(el('li', limit)); methods.append(ul);
      const manifestLink = el('a', 'Snapshot provenance (JSON)'); manifestLink.href = '/reference-data/heavenwatch/manifest.json'; manifestLink.target = '_blank'; manifestLink.rel = 'noopener'; methods.append(manifestLink); detail.append(methods);
    } catch (error) {if (selection === intent) status.textContent = error.message;}
  }
  const picker = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  picker.setInputAction(async event => {
    if (!dataManager.isEnabled('ground-motion') || dialog.open) return;
    const ray = viewer.camera.getPickRay(event.position);
    const point = ray && viewer.scene.globe.pick(ray, viewer.scene); if (!point) return;
    const geo = Cesium.Cartographic.fromCartesian(point), intent = ++sampleIntent;
    const variant = layer.getState().variantId;
    sample.textContent = 'Reading pixel…';
    try {
      const result = await layer.sample(Cesium.Math.toDegrees(geo.longitude), Cesium.Math.toDegrees(geo.latitude));
      if (disposed || sampleIntent !== intent || variant !== layer.getState().variantId) return;
      sample.textContent = result.status === 'value' ? `${result.value >= 0 ? '+' : ''}${result.value.toFixed(2)} mm/year LOS · ${result.latitude.toFixed(5)}, ${result.longitude.toFixed(5)}` : result.status === 'no-data' ? 'No valid observation at this pixel. This is not zero motion.' : 'Outside the installed Crane County coverage.';
    } catch (error) {if (!disposed && sampleIntent === intent) sample.textContent = error.message;}
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  list(); void showDetail(REFERENCE_CATALOG[0]); sync();
  return () => {disposed = true; abort.abort(); unsubscribe(); unactivity(); picker.destroy(); dialog.remove(); legend.remove();};
}
