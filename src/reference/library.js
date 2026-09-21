import { mountMotionHistoryPanel } from './motionHistoryPanel.js';
import * as Cesium from 'cesium';
import { REFERENCE_CATALOG } from './catalog.js';

export function mountReferenceLibrary({ viewer, dataManager, layer, catalog }) {
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
  legend.id = 'ground-motion-legend';
  legend.hidden = true;
  legend.setAttribute('aria-label', 'Ground movement legend');
  legend.innerHTML = `<header><strong>GROUND MOVEMENT</strong><button data-hide aria-label="Hide ground movement">✕</button></header><small data-motion-heading>NASA OPERA / ASF · long-term LOS velocity</small><label>Measurement<select data-variant><option value="displacement">Full displacement</option><option value="short_wavelength_displacement">Short wavelength</option></select></label><div class="ref-colorbar"></div><div class="ref-scale"><span>−30 · away</span><span>0</span><span>+30 · toward</span></div><small data-map-units>mm/year · relative to satellite · colors saturate</small><label>Opacity<input data-opacity type="range" min="0" max="1" step="0.05" value="0.7"></label><div data-motion-reference hidden><button data-set-motion-reference>Set movement reference on map</button><button data-clear-motion-reference>Clear movement reference</button><p data-motion-reference-status>Absolute velocity · no reference selected.</p></div><p data-sample role="status">Click inside the colored area to sample a pixel.</p><button data-library>Sources & layer library</button>`;
  document.body.append(legend);
  const locationPanel = document.createElement('section');
  locationPanel.className = 'motion-location';
  locationPanel.setAttribute('aria-label', 'Selected ground-movement location');
  locationPanel.innerHTML = `<strong>Selected location</strong><p data-motion-location aria-live="polite">No location selected</p>
    <div class="motion-regions"><button data-pick-motion aria-pressed="true">Pick location on map</button><button data-cancel-pick>Cancel picking</button><button data-locate-motion disabled>Zoom to point</button><button data-clear-motion disabled>Clear point</button></div>
    <p data-motion-pick-status role="status">Click once on the map to select a point.</p>
    <form data-motion-location-form><label>Latitude, longitude<input aria-label="Ground movement coordinates" placeholder="31.40070, -102.60490" required></label><button type="submit">Use coordinates</button></form>`;
  legend.insertBefore(
    locationPanel,
    legend.querySelector('[data-variant]').parentElement,
  );
  const historyPanel = mountMotionHistoryPanel(legend, layer);
  const detail = dialog.querySelector('.ref-detail'),
    nav = dialog.querySelector('nav');
  const sample = legend.querySelector('[data-sample]');
  locationPanel.insertBefore(sample, locationPanel.querySelector('form'));
  let selected = 'texas-wells',
    disposed = false,
    selection = 0,
    sampleIntent = 0;
  let motionPicking = true,
    pickingReference = false,
    selectedMotionPoint = null,
    motionMarker = null,
    lastCoverage = layer.getState().coverage + ':' + layer.getState().mapPeriod;
  const abort = new AbortController();
  const on = (el, type, fn) =>
    el.addEventListener(type, fn, { signal: abort.signal });
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const open = () => {
    if (!dialog.open) dialog.showModal();
  };
  on(trigger, 'click', (event) => {
    event.stopPropagation();
    open();
  });
  on(dialog.querySelector('[data-close]'), 'click', () => dialog.close());
  on(dialog, 'close', () => trigger.focus());
  on(legend.querySelector('[data-library]'), 'click', open);
  on(legend.querySelector('[data-hide]'), 'click', () =>
    dataManager
      .setEnabled('ground-motion', false, { origin: 'user' })
      .catch((error) => {
        sample.textContent = error.message;
      }),
  );
  on(legend.querySelector('[data-variant]'), 'change', async (event) => {
    sampleIntent++;
    sample.textContent = 'Click to sample this measurement.';
    try {
      await layer.setVariant(event.target.value);
    } catch (error) {
      sample.textContent = error.message;
      sync();
    }
  });
  on(legend.querySelector('[data-opacity]'), 'input', (event) =>
    layer.setOpacity(Number(event.target.value)),
  );
  function updateSelection(point) {
    selectedMotionPoint = point;
    if (motionMarker) viewer.entities.remove(motionMarker);
    motionMarker = null;
    if (point) {
      motionMarker = viewer.entities.add({
        name: 'Selected ground-movement location',
        position: Cesium.Cartesian3.fromDegrees(
          point.longitude,
          point.latitude,
        ),
        point: {
          pixelSize: 18,
          color: Cesium.Color.fromCssColorString('#ed63e1'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 3,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: 'Surface change · selected point',
          font: '13px sans-serif',
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#14242b'),
          pixelOffset: new Cesium.Cartesian2(0, -30),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
    locationPanel.querySelector('[data-motion-location]').textContent = point
      ? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`
      : 'No location selected';
    locationPanel.querySelector('input').value = point
      ? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`
      : '';
    locationPanel.querySelector('[data-locate-motion]').disabled = !point;
    locationPanel.querySelector('[data-clear-motion]').disabled = !point;
    viewer.scene.requestRender();
    sync();
  }
  on(legend.querySelector('[data-pick-motion]'), 'click', () => {
    motionPicking = true;
    pickingReference = false;
    sync();
  });
  on(legend.querySelector('[data-cancel-pick]'), 'click', () => {
    motionPicking = false;
    pickingReference = false;
    sync();
  });
  on(legend.querySelector('[data-clear-motion]'), 'click', () => {
    sampleIntent++;
    motionPicking = false;
    pickingReference = false;
    historyPanel.clear();
    updateSelection(null);
    sample.textContent = 'Point cleared. Choose a new location to inspect.';
  });
  on(legend.querySelector('[data-locate-motion]'), 'click', () => {
    if (selectedMotionPoint)
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          selectedMotionPoint.longitude,
          selectedMotionPoint.latitude,
          15000,
        ),
        duration: 1,
      });
  });
  on(legend.querySelector('[data-motion-location-form]'), 'submit', (event) => {
    event.preventDefault();
    const parts = locationPanel
      .querySelector('input')
      .value.split(',')
      .map((value) => value.trim());
    const [latitude, longitude] = parts.map(Number);
    if (
      parts.length !== 2 ||
      parts.some((value) => !value) ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 85 ||
      Math.abs(longitude) > 180
    ) {
      locationPanel.querySelector('[data-motion-pick-status]').textContent =
        'Enter latitude, longitude in decimal degrees (latitude −85 to 85).';
      return;
    }
    void inspectMotionPoint(longitude, latitude);
  });
  on(legend.querySelector('[data-set-motion-reference]'), 'click', () => {
    motionPicking = true;
    pickingReference = true;
    sample.textContent =
      'Click a valid archive pixel to set the ground-movement reference.';
    sync();
  });
  on(
    legend.querySelector('[data-clear-motion-reference]'),
    'click',
    async () => {
      pickingReference = false;
      try {
        await layer.setReference(null);
      } catch (error) {
        sample.textContent = error.message;
      }
    },
  );
  function sync() {
    const state = layer.getState();
    if (state.coverage !== 'crane') pickingReference = false;
    legend.querySelector('[data-motion-reference]').hidden =
      state.coverage !== 'crane';
    legend.querySelector('[data-pick-motion]').textContent = selectedMotionPoint
      ? 'Change location on map'
      : 'Pick location on map';
    legend.querySelector('[data-cancel-pick]').hidden = !motionPicking;
    locationPanel.querySelector('[data-motion-pick-status]').textContent =
      motionPicking
        ? pickingReference
          ? 'Click a pixel to set the archive movement reference.'
          : 'Click once on the map. The selected point stays locked until you choose Change location.'
        : selectedMotionPoint
          ? 'Point locked. Use Change location or edit the coordinates below.'
          : 'Choose Pick location on map or enter coordinates.';
    if (motionMarker)
      motionMarker.show = dataManager.isEnabled('ground-motion');
    if (lastCoverage !== state.coverage + ':' + state.mapPeriod) {
      lastCoverage = state.coverage + ':' + state.mapPeriod;
      sampleIntent++;
      historyPanel.clear();
      if (selectedMotionPoint)
        void inspectMotionPoint(
          selectedMotionPoint.longitude,
          selectedMotionPoint.latitude,
        );
    }
    legend
      .querySelector('[data-pick-motion]')
      .setAttribute('aria-pressed', String(motionPicking));
    legend.querySelector('[data-motion-reference-status]').textContent =
      state.reference
        ? `Movement reference: ${state.reference.latitude.toFixed(5)}, ${state.reference.longitude.toFixed(5)} · independent of terrain comparison`
        : 'Absolute velocity · no reference selected.';
    legend.hidden = !dataManager.isEnabled('ground-motion');
    legend.querySelector('[data-motion-heading]').textContent =
      state.coverage === 'permian'
        ? 'Permian pilot · measured displacement · historical archive'
        : state.coverage === 'us'
          ? 'NASA OPERA / ASF · US velocity overview · dates vary by frame'
          : 'Crane archive · 2016-08-01 → 2025-12-30';
    const relative = state.coverage === 'crane' && state.reference;
    legend.querySelector('.ref-colorbar').style.background =
      state.coverage !== 'crane' || relative
        ? 'linear-gradient(90deg,#278ec4,#ebe7cb,#d74e2b)'
        : '';
    legend.querySelector('[data-map-units]').textContent =
      state.coverage === 'permian'
        ? 'mm LOS change · fixed ±100 mm scale · colors saturate'
        : 'mm/year · relative to satellite · colors saturate';
    legend.querySelector('.ref-scale').innerHTML =
      state.coverage === 'permian'
        ? '<span>−100 · away</span><span>0</span><span>+100 · toward</span>'
        : relative
          ? '<span>−30 · below reference rate</span><span>0</span><span>+30 · above reference rate</span>'
          : '<span>−30 · away</span><span>0</span><span>+30 · toward</span>';
    if (state.error) sample.textContent = state.error;
    legend.querySelector('[data-variant]').value = state.variantId;
    legend.querySelector('[data-opacity]').value = state.opacity;
  }
  const unsubscribe = layer.subscribe(sync),
    unactivity = dataManager.subscribeActivity(sync);
  function list() {
    nav.replaceChildren();
    const query = dialog
      .querySelector('input[type=search]')
      .value.toLowerCase();
    const entries = REFERENCE_CATALOG.filter((item) =>
      Object.values(item).join(' ').toLowerCase().includes(query),
    );
    for (const item of entries) {
      const button = el('button', '');
      button.className = item.id === selected ? 'selected' : '';
      button.setAttribute('aria-pressed', String(item.id === selected));
      button.append(
        el('strong', item.name),
        el('small', `${item.group} · ${item.status}`),
      );
      button.addEventListener('click', () => {
        selected = item.id;
        list();
        void showDetail(item);
      });
      nav.append(button);
    }
    if (!entries.length) nav.append(el('p', 'No matching layers.'));
  }
  on(dialog.querySelector('input[type=search]'), 'input', list);
  function reveal(item) {
    dialog.close();
    document.dispatchEvent(
      new CustomEvent('landman:inspect', {
        detail: {
          layerId: item.layerId,
          datasetId: item.datasetId,
          name: item.name,
        },
      }),
    );
  }
  async function showDetail(item) {
    const intent = ++selection;
    detail.replaceChildren(
      el('span', item.status, `ref-badge ${item.layerId ? 'available' : ''}`),
      el('h3', item.name),
      el('p', item.note),
    );
    const dl = document.createElement('dl');
    for (const [title, value] of [
      ['Source', item.source],
      ['Coverage', item.coverage],
      ['Data', item.format],
      ['Next step', item.next],
    ])
      dl.append(el('dt', title), el('dd', value));
    detail.append(dl);
    const link = el('a', 'Open source documentation ↗');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    detail.append(link);
    if (!item.layerId) {
      detail.append(
        el(
          'p',
          item.status === 'On disk'
            ? 'Source artifacts exist in HeavenWatch. They still need an import and quality review before they can be displayed here.'
            : 'Roadmap item — this layer is not connected yet.',
          'ref-note',
        ),
      );
      return;
    }
    if (item.layerId === 'reference-records') {
      const status = el(
        'p',
        'Local dataset with retained source records and reporting periods.',
        'ref-note',
      );
      const view = el('button', 'Open collection', 'ref-primary');
      view.addEventListener('click', async () => {
        view.disabled = true;
        try {
          if (!dataManager.isEnabled('reference-records'))
            catalog.get('reference-records').select(item.datasetId);
          await dataManager.setEnabled('reference-records', true, {
            origin: 'user',
          });
          if (!dataManager.isEnabled('reference-records'))
            throw new Error('Reference collection could not be enabled');
          await catalog.get('reference-records').showDataset(item.datasetId);
          reveal(item);
        } catch (error) {
          status.textContent = error.message;
        } finally {
          view.disabled = false;
        }
      });
      detail.append(status, view);
      return;
    }
    if (item.layerId === 'land-parcels') {
      const status = el(
        'p',
        'Appraisal-reported owners with dated county sources; mineral rights remain unknown without recorded evidence.',
      );
      const view = el('button', 'Explore land ownership', 'ref-primary');
      view.addEventListener('click', async () => {
        view.disabled = true;
        try {
          await dataManager.setEnabled('land-parcels', true, {
            origin: 'user',
          });
          reveal(item);
          catalog.get('land-parcels').flyTo();
        } catch (error) {
          status.textContent = error.message;
        } finally {
          view.disabled = false;
        }
      });
      detail.append(status, view);
      return;
    }
    if (item.layerId === 'us-basins') {
      const status = el(
        'p',
        'USGS boundary snapshot · 144 source polygons · retrieved September 2026',
        'ref-note',
      );
      const view = el('button', 'View US geological basins', 'ref-primary');
      view.addEventListener('click', async () => {
        view.disabled = true;
        try {
          await dataManager.setEnabled('us-basins', true, { origin: 'user' });
          if (!dataManager.isEnabled('us-basins'))
            throw new Error('Basin layer could not be enabled');
          catalog.get('us-basins').flyTo();
          reveal(item);
        } catch (error) {
          status.textContent = error.message;
        } finally {
          view.disabled = false;
        }
      });
      detail.append(status, view);
      return;
    }
    if (item.layerId === 'texas-wells') {
      const texasLayer = catalog.get('texas-wells');
      const status = el('p', 'Reading statewide database…', 'ref-note');
      detail.append(status);
      try {
        const data = await texasLayer.readStatus();
        if (disposed || selection !== intent) return;
        status.textContent = data.datasets
          .map(
            (d) =>
              `${d.name === 'gis' ? 'GIS well locations' : 'UIC permits'}: ${Number(d.row_count).toLocaleString()} · imported ${new Date(d.completed_at).toLocaleString()}`,
          )
          .join(' / ');
        const view = el('button', 'Explore all Texas wells', 'ref-primary');
        view.addEventListener('click', async () => {
          view.disabled = true;
          try {
            await dataManager.setEnabled('injection-wells', false, {
              origin: 'user',
            });
            await dataManager.setEnabled('texas-wells', true, {
              origin: 'user',
            });
            if (!dataManager.isEnabled('texas-wells'))
              throw new Error('Texas layer could not be enabled');
            texasLayer.flyTo();
            reveal(item);
          } catch (error) {
            status.textContent = error.message;
          } finally {
            view.disabled = false;
          }
        });
        detail.append(
          view,
          el(
            'p',
            'Zoom through clusters, filter RRC GIS classifications, or search a Texas API number. Selecting a well shows its UIC permits. Disposal history is fetched by well and saved in the database; the entire statewide H-10 history is not preloaded.',
            'ref-note',
          ),
        );
        detail.append(
          el(
            'p',
            'Statewide GIS and UIC inventories are complete source snapshots. Records without usable coordinates or valid API numbers remain in the database with their limitations. Oil/gas production history, ownership and leases require separate sources.',
          ),
        );
      } catch (error) {
        if (selection === intent) status.textContent = error.message;
      }
      return;
    }
    if (item.layerId === 'injection-wells') {
      const wellsLayer = catalog.get('injection-wells');
      const status = el('p', 'Connecting to Texas RRC…', 'ref-note');
      detail.append(status);
      try {
        const data = await wellsLayer.readData();
        if (disposed || selection !== intent) return;
        status.textContent = `${data.wellCount} wells · ${data.historyWellCount} with history · ${data.recordCount.toLocaleString()} records · ${data.period.join(' → ')}`;
        detail.append(
          el(
            'p',
            data.connection?.warning ||
              (data.sourceRetrievedAt
                ? `Texas RRC refreshed ${new Date(data.sourceRetrievedAt).toLocaleString()}. Server cache: up to 6 hours. Reopen the app to load a newer snapshot; refresh is requested when the cache expires.`
                : 'Historical fallback archive; original retrieval date unavailable.'),
            'ref-note',
          ),
        );
        const view = el(
          'button',
          'View disposal wells & history',
          'ref-primary',
        );
        view.addEventListener('click', async () => {
          view.disabled = true;
          try {
            await dataManager.setEnabled(item.layerId, true, {
              origin: 'user',
            });
            if (!dataManager.isEnabled(item.layerId))
              throw new Error('Well layer could not be enabled');
            await wellsLayer.flyTo();
            reveal(item);
          } catch (error) {
            status.textContent = error.message;
          } finally {
            view.disabled = false;
          }
        });
        detail.append(
          view,
          el(
            'p',
            'Choose a reporting month, then click a marker or select an API-8 to inspect history. You can display these wells together with ground movement.',
            'ref-note',
          ),
        );
        const limitations = document.createElement('ul');
        for (const note of data.limitations) limitations.append(el('li', note));
        detail.append(limitations);
        for (const source of data.sources) {
          const a = el('a', source.name + ' ↗');
          a.href = source.url;
          a.target = '_blank';
          a.rel = 'noopener';
          detail.append(a, document.createElement('br'));
        }
      } catch (error) {
        if (selection === intent) status.textContent = error.message;
      }
      return;
    }
    const status = el('p', 'Loading snapshot…', 'ref-note');
    detail.append(status);
    try {
      const m = await layer.readManifest();
      if (disposed || selection !== intent) return;
      status.textContent = `${m.title} · ${m.acquisitions} acquisitions · ${m.startDate} → ${m.endDate} · ${m.frame}`;
      detail.append(el('p', m.evidence), el('p', m.sign));
      const view = el('button', 'View ground movement on map', 'ref-primary');
      view.addEventListener('click', async () => {
        view.disabled = true;
        try {
          await dataManager.setEnabled(item.layerId, true, { origin: 'user' });
          if (!dataManager.isEnabled(item.layerId))
            throw new Error('Layer could not be enabled');
          await layer.flyTo();
          reveal(item);
          sync();
        } catch (error) {
          status.textContent = error.message;
        } finally {
          view.disabled = false;
        }
      });
      detail.append(
        view,
        el(
          'p',
          'Uses satellite terrain so the raster stays visible. Google 3D remains selectable from the map controls.',
          'ref-note',
        ),
      );
      const nasa = el('button', 'Check NASA for latest acquisition');
      nasa.dataset.checkNasa = '';
      const availability = el(
        'p',
        'NASA catalog checks are live; the displayed velocity is a processed historical snapshot.',
        'ref-note',
      );
      availability.setAttribute('role', 'status');
      nasa.addEventListener('click', async () => {
        nasa.disabled = true;
        availability.textContent = 'Checking NASA Earthdata…';
        try {
          const response = await fetch(
            '/api/reference/ground-motion/availability',
            { signal: abort.signal },
          );
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'NASA check failed');
          const latest = data.latest.acquisitionDate.slice(0, 10);
          availability.textContent = `${data.collection} / ${data.frame}: latest acquisition ${latest}. Displayed through ${m.endDate}. ${latest > m.endDate ? 'Newer data is available for processing.' : 'The displayed end date matches or exceeds the catalog result.'} Checked ${new Date(data.checkedAt).toLocaleString()}.`;
        } catch (error) {
          availability.textContent = error.message;
        } finally {
          nasa.disabled = false;
        }
      });
      detail.append(nasa, availability);
      const methods = document.createElement('details');
      methods.append(
        el('summary', 'Method, quality and limitations'),
        el('p', m.method),
        el('p', m.quality),
      );
      const ul = document.createElement('ul');
      for (const limit of m.limitations) ul.append(el('li', limit));
      methods.append(ul);
      const manifestLink = el('a', 'Snapshot provenance (JSON)');
      manifestLink.href = '/reference-data/heavenwatch/manifest.json';
      manifestLink.target = '_blank';
      manifestLink.rel = 'noopener';
      methods.append(manifestLink);
      detail.append(methods);
    } catch (error) {
      if (selection === intent) status.textContent = error.message;
    }
  }
  const picker = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  picker.setInputAction(async (event) => {
    if (document.body.dataset.locationPicking) return;
    if (
      !motionPicking ||
      !legend.getClientRects().length ||
      !dataManager.isEnabled('ground-motion') ||
      dialog.open
    )
      return;
    const ray = viewer.camera.getPickRay(event.position);
    const point = ray && viewer.scene.globe.pick(ray, viewer.scene);
    if (!point) return;
    const geo = Cesium.Cartographic.fromCartesian(point);
    const longitude = Cesium.Math.toDegrees(geo.longitude),
      latitude = Cesium.Math.toDegrees(geo.latitude);
    if (pickingReference) {
      pickingReference = false;
      motionPicking = false;
      try {
        await layer.setReference({ longitude, latitude });
      } catch (error) {
        sample.textContent = error.message;
      }
      sync();
      return;
    }
    void inspectMotionPoint(longitude, latitude);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  async function inspectMotionPoint(longitude, latitude) {
    const intent = ++sampleIntent;
    motionPicking = false;
    pickingReference = false;
    updateSelection({ longitude, latitude });
    if (layer.getState().coverage === 'us') {
      sample.textContent =
        'The chart reports change at the selected map marker.';
      await historyPanel.inspect(longitude, latitude);
      return;
    }
    const variant = layer.getState().variantId;
    sample.textContent = 'Reading pixel…';
    try {
      const result = await layer.sample(longitude, latitude);
      if (
        disposed ||
        sampleIntent !== intent ||
        variant !== layer.getState().variantId
      )
        return;
      sample.textContent =
        result.status === 'value'
          ? `${result.value >= 0 ? '+' : ''}${result.value.toFixed(2)} ${result.units || 'mm/year LOS'} · ${result.latitude.toFixed(5)}, ${result.longitude.toFixed(5)}`
          : result.status === 'no-data'
            ? 'No valid observation at this pixel. This is not zero motion.'
            : layer.getState().coverage === 'permian'
              ? 'Outside the two installed Permian pilot footprints. Use Crane / Tubbs or Toyah to zoom to available pixels.'
              : 'Outside the installed Crane County coverage.';
      if (result.startDate)
        sample.textContent += ` · ${result.area}: ${result.startDate} → ${result.endDate}`;
      const base = layer.getState().referenceValue;
      if (result.status === 'value' && Number.isFinite(base))
        sample.textContent += ` · ${(result.value - base).toFixed(2)} mm/year relative to movement reference`;
    } catch (error) {
      if (!disposed && sampleIntent === intent)
        sample.textContent = error.message;
    }
  }
  list();
  void showDetail(REFERENCE_CATALOG[0]);
  sync();
  return () => {
    disposed = true;
    abort.abort();
    unsubscribe();
    unactivity();
    picker.destroy();
    if (motionMarker && !viewer.isDestroyed())
      viewer.entities.remove(motionMarker);
    historyPanel.destroy();
    dialog.remove();
    legend.remove();
  };
}
