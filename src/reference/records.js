import * as Cesium from 'cesium';
import { assetSymbol, etColor } from './mapSymbols.js';
export const REFERENCE_COLORS = {
  'texnet-seismic': '#ff7b64',
  'texnet-injection': '#c197ff',
  flares: '#ffc24b',
  ponds: '#42d9cf',
  tanks: '#d7bd8b',
  'nm-disposal': '#efbc68',
  'nm-water': '#55baff',
  openet: '#77db88',
  'cooling-water': '#73b7ec',
  'rrc-inactive': '#f1a2d2',
  'rrc-plugging': '#aaa6f5',
};
export function createReferenceRecordsLayer() {
  let viewer,
    enabled = false,
    metadata = [],
    selected = 'texnet-seismic',
    error = null,
    detail = null,
    archive = null,
    removeMove,
    timer,
    detailIntent = 0;
  const active = new Set(),
    sources = new Map(),
    requests = new Map(),
    results = new Map(),
    periods = new Map(),
    measurements = new Map(),
    listeners = new Set(),
    picks = new Map();
  const notify = () => listeners.forEach((fn) => fn());
  const get = async (path, signal) => {
    const r = await fetch('/api/reference/records/' + path, { signal });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Reference data unavailable');
    return d;
  };
  function box() {
    const r = viewer.camera.computeViewRectangle();
    if (!r || r.west >= r.east) return [-125, 24, -66, 50];
    return [r.west, r.south, r.east, r.north].map(Cesium.Math.toDegrees);
  }
  function remove(id) {
    requests.get(id)?.abort();
    requests.delete(id);
    const s = sources.get(id);
    if (s && !viewer.isDestroyed()) viewer.dataSources.remove(s, true);
    sources.delete(id);
    results.delete(id);
    for (const [key, value] of picks)
      if (value.dataset === id) picks.delete(key);
  }
  async function refresh(id) {
    if (!enabled || !active.has(id)) return;
    requests.get(id)?.abort();
    const request = new AbortController();
    requests.set(id, request);
    notify();
    try {
      const result = await get(
        'viewport?' +
          new URLSearchParams({
            dataset: id,
            bbox: box().join(','),
            period: periods.get(id) || '',
            kind: measurements.get(id) || 'ET',
          }),
        request.signal,
      );
      if (request.signal.aborted || !enabled || !active.has(id)) return;
      let source = sources.get(id);
      if (!source) {
        source = new Cesium.CustomDataSource('Reference · ' + id);
        sources.set(id, source);
        await viewer.dataSources.add(source);
      }
      source.entities.removeAll();
      for (const [key, value] of picks)
        if (value.dataset === id) picks.delete(key);
      results.set(id, result);
      const base = Cesium.Color.fromCssColorString(
        REFERENCE_COLORS[id] || '#6ecdd4',
      );
      for (const [i, f] of result.features.entries()) {
        const key = `reference:${id}:${i}`,
          cluster = result.mode === 'clusters';
        picks.set(key, { dataset: id, feature: f, cluster });
        const color =
          id === 'openet'
            ? Cesium.Color.fromCssColorString(etColor(f.value))
            : base;
        source.entities.add({
          id: key,
          position: Cesium.Cartesian3.fromDegrees(f.longitude, f.latitude),
          ...(cluster
            ? {
                point: {
                  pixelSize: Math.min(22, 8 + Math.log10(f.count + 1) * 3),
                  color,
                  outlineColor: Cesium.Color.BLACK,
                  outlineWidth: 1,
                  disableDepthTestDistance: Infinity,
                  heightReference: Cesium.HeightReference.NONE,
                },
              }
            : {
                billboard: {
                  image: assetSymbol(
                    id,
                    id === 'openet' ? etColor(f.value) : REFERENCE_COLORS[id],
                  ),
                  width: 18,
                  height: 18,
                  disableDepthTestDistance: Infinity,
                  heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                  show: !(id === 'openet' && f.geometry),
                },
              }),
        });
        if (
          !cluster &&
          f.geometry &&
          ['Polygon', 'MultiPolygon'].includes(f.geometry.type)
        ) {
          const polygons =
            f.geometry.type === 'Polygon'
              ? [f.geometry.coordinates]
              : f.geometry.coordinates;
          for (const [part, rings] of polygons.entries()) {
            const hierarchy = (r) =>
              new Cesium.PolygonHierarchy(
                Cesium.Cartesian3.fromDegreesArray(r.flat()),
              );
            source.entities.add({
              id: key + ':area:' + part,
              polygon: {
                hierarchy: new Cesium.PolygonHierarchy(
                  Cesium.Cartesian3.fromDegreesArray(rings[0].flat()),
                  rings.slice(1).map(hierarchy),
                ),
                material: color.withAlpha(id === 'openet' ? 0.65 : 0.35),
                classificationType: Cesium.ClassificationType.BOTH,
              },
            });
            if (id === 'openet')
              for (const [ringIndex, ring] of rings.entries()) {
                const borderKey = key + ':border:' + part + ':' + ringIndex;
                source.entities.add({
                  id: borderKey,
                  polyline: {
                    positions: Cesium.Cartesian3.fromDegreesArray(ring.flat()),
                    width: 1.5,
                    material: Cesium.Color.fromCssColorString('#304e68'),
                    clampToGround: true,
                  },
                });
                picks.set(borderKey, {
                  dataset: id,
                  feature: f,
                  cluster: false,
                });
              }
            picks.set(key + ':area:' + part, {
              dataset: id,
              feature: f,
              cluster: false,
            });
          }
        }
      }
      error = null;
      viewer.scene.requestRender();
    } catch (e) {
      if (e.name !== 'AbortError') error = e.message;
    } finally {
      if (requests.get(id) === request) requests.delete(id);
      notify();
    }
  }
  const refreshAll = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const id of active) void refresh(id);
    }, 180);
  };
  const layer = {
    id: 'reference-records',
    name: 'Wells, water & environment',
    icon: '◈',
    source: 'RRC · TexNet · EIA · OpenET',
    updateInterval: 0,
    init(v) {
      viewer = v;
      removeMove = v.camera.moveEnd.addEventListener(refreshAll);
      return true;
    },
    async readCatalog() {
      metadata = (await get('catalog')).datasets;
      notify();
      return metadata;
    },
    async enable() {
      await this.readCatalog();
      enabled = true;
      if (!active.size && selected !== 'rrc-records') active.add(selected);
      await Promise.all([...active].map(refresh));
      notify();
      return true;
    },
    disable() {
      enabled = false;
      detailIntent++;
      clearTimeout(timer);
      for (const id of [...sources.keys(), ...requests.keys()]) remove(id);
      notify();
      return true;
    },
    destroy() {
      this.disable();
      removeMove?.();
      listeners.clear();
      return true;
    },
    update() {
      return true;
    },
    async showDataset(id) {
      if (!metadata.some((d) => d.id === id)) return;
      selected = id;
      detailIntent++;
      detail = null;
      archive = null;
      if (id !== 'rrc-records') {
        active.add(id);
        if (id === 'openet' && !periods.has(id)) periods.set(id, '2018-07');
        await refresh(id);
        if (selected === id && enabled) this.flyTo(id);
      } else await this.searchArchive({});
      notify();
    },
    async toggle(id, on) {
      if (on) {
        active.add(id);
        await refresh(id);
      } else {
        active.delete(id);
        remove(id);
      }
      notify();
    },
    select(id) {
      selected = id;
      detailIntent++;
      detail = null;
      archive = null;
      notify();
    },
    flyTo(id = selected) {
      const b = metadata.find((d) => d.id === id)?.bounds;
      if (b?.length === 4 && b.every(Number.isFinite)) {
        const dx = Math.max((b[2] - b[0]) * 0.07, 0.015),
          dy = Math.max((b[3] - b[1]) * 0.07, 0.015);
        viewer.camera.flyTo({
          destination: Cesium.Rectangle.fromDegrees(
            Math.max(-180, b[0] - dx),
            Math.max(-90, b[1] - dy),
            Math.min(180, b[2] + dx),
            Math.min(90, b[3] + dy),
          ),
          duration: 1.5,
        });
      }
    },
    setPeriod(value) {
      periods.set(selected, value);
      void refresh(selected);
      notify();
    },
    setMeasurement(value) {
      measurements.set(selected, value);
      void refresh(selected);
      notify();
    },
    async pick(id) {
      const item = picks.get(id);
      if (!item) return;
      const f = item.feature;
      if (item.cluster) {
        const dx = Math.max((f.east - f.west) * 0.1, 0.008),
          dy = Math.max((f.north - f.south) * 0.1, 0.008);
        viewer.camera.flyTo({
          destination: Cesium.Rectangle.fromDegrees(
            f.west - dx,
            f.south - dy,
            f.east + dx,
            f.north + dy,
          ),
          duration: 1.2,
        });
        return;
      }
      selected = item.dataset;
      await this.loadDetail(item.dataset, f.key);
    },
    async loadDetail(dataset, key, offset = 0) {
      const intent = ++detailIntent;
      detail = { loading: true };
      archive = null;
      notify();
      try {
        const data = await get(
          'detail?' + new URLSearchParams({ dataset, key, offset }),
        );
        if (intent === detailIntent) detail = { ...data, dataset, key };
      } catch (e) {
        if (intent === detailIntent) detail = { error: e.message };
      }
      notify();
    },
    async searchArchive(filters) {
      const intent = ++detailIntent;
      selected = 'rrc-records';
      detail = null;
      archive = { loading: true, filters };
      notify();
      try {
        const data = await get('rrc?' + new URLSearchParams(filters));
        if (intent === detailIntent) archive = { ...data, filters };
      } catch (e) {
        if (intent === detailIntent) archive = { error: e.message, filters };
      }
      notify();
    },
    openArchive(api) {
      void this.searchArchive({ api });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getState() {
      return {
        enabled,
        metadata,
        selected,
        active: [...active],
        results: new Map(results),
        loading: [...requests.keys()],
        period: periods.get(selected) || '',
        measurement: measurements.get(selected) || 'ET',
        detail,
        archive,
        error,
      };
    },
    getFilters(id) {
      return {
        period: periods.get(id) || '',
        kind: measurements.get(id) || 'ET',
      };
    },
    getStats() {
      return {
        count: [...results.values()].reduce((n, r) => n + r.count, 0),
        source: 'Local source snapshots',
        error,
      };
    },
  };
  return layer;
}
