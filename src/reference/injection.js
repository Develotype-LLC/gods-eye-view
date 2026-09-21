import * as Cesium from 'cesium';
import {validateInjection, injectionAt} from './injectionModel.js';
export function createInjectionLayer() {
  let viewer, data, pending, source, enabled = false, generation = 0, selectedId = null, month = null, error = null;
  const listeners = new Set(), abort = new AbortController();
  const notify = () => {for (const fn of listeners) fn();};
  async function readData() {
    if (!pending) pending = fetch('/reference-data/heavenwatch/injection.json', {signal: abort.signal}).then(async response => {
      if (!response.ok) throw new Error('Injection snapshot is not installed');
      data = validateInjection(await response.json()); month ??= data.period[1]; return data;
    }).catch(reason => {pending = null; throw reason;});
    return pending;
  }
  function paint() {
    if (!source) return;
    for (const well of data.wells) {
      const entity = source.entities.getById(`injection:${well.id}`), row = injectionAt(well, month);
      entity.point.color = Cesium.Color.fromCssColorString(!row ? '#75838b' : row.bbl === 0 ? '#fff1c2' : '#43ead5');
      entity.point.pixelSize = selectedId === well.id ? 17 : row && row.bbl > 0 ? 11 : 7;
      entity.point.outlineColor = selectedId === well.id ? Cesium.Color.WHITE : Cesium.Color.BLACK;
    }
    viewer.scene.requestRender(); notify();
  }
  function remove() {if (source && !viewer.isDestroyed()) viewer.dataSources.remove(source, true); source = null;}
  return {
    id: 'injection-wells', name: 'Disposal wells & injection', icon: '◉', source: 'Texas RRC · historical archive', updateInterval: 0,
    init(value) {viewer = value; return true;},
    async enable() {
      const intent = ++generation;
      try {
        await readData(); if (intent !== generation) return false;
        const next = new Cesium.CustomDataSource('RRC disposal wells');
        for (const well of data.wells) next.entities.add({id: `injection:${well.id}`, name: `RRC disposal · API-8 ${well.api8}`,
          position: Cesium.Cartesian3.fromDegrees(well.longitude, well.latitude),
          point: {pixelSize: 9, color: Cesium.Color.CYAN, outlineWidth: 2, outlineColor: Cesium.Color.BLACK, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY}});
        await viewer.dataSources.add(next);
        if (intent !== generation) {viewer.dataSources.remove(next, true); return false;}
        source = next; enabled = true; error = null; paint(); return true;
      } catch (reason) {error = reason.message; enabled = false; remove(); notify(); throw reason;}
    },
    disable() {generation++; enabled = false; remove(); notify(); viewer?.scene.requestRender(); return true;},
    destroy() {generation++; enabled = false; abort.abort(); remove(); listeners.clear(); return true;},
    update() {return true;}, readData,
    setMonth(value) {if (data && /^\d{4}-\d{2}$/.test(value) && value >= data.period[0] && value <= data.period[1]) {month = value; paint();}},
    select(id) {if (data?.wells.some(well => well.id === id)) {selectedId = id; paint();}},
    async flyTo() {await readData(); viewer.camera.flyTo({destination: Cesium.Rectangle.fromDegrees(...data.bounds), duration: 1.5});},
    getState() {return {data, enabled, selectedId, month, error};},
    subscribe(fn) {listeners.add(fn); return () => listeners.delete(fn);},
    getStats() {return {count: enabled ? data.wells.length : 0, source: 'Texas RRC · historical archive', coverage: 'Crane County area · 2016–2025', error};},
  };
}
