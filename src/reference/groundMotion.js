import * as Cesium from 'cesium';
import { validateRaster, sampleRaster } from './raster.js';

const ROOT = '/reference-data/heavenwatch/';

export function createGroundMotionLayer() {
  let viewer, mapController, manifest, manifestPromise, imagery, enabled = false, destroyed = false;
  let variantId = 'displacement', opacity = 0.7, generation = 0, error = null;
  const listeners = new Set();
  const values = new Map();
  const controller = new AbortController();
  const notify = () => { for (const listener of listeners) listener(); };
  const render = () => viewer?.scene.requestRender();
  async function readManifest() {
    if (!manifestPromise) {
      manifestPromise = fetch(ROOT + 'manifest.json', {signal: controller.signal}).then(async response => {
        if (!response.ok) throw new Error('Ground-motion snapshot is not installed');
        const result = await response.json();
        if (result.schemaVersion !== 1 || !Array.isArray(result.variants) || result.variants.length !== 2) throw new Error('Unsupported ground-motion snapshot');
        result.variants.forEach(validateRaster);
        manifest = result;
        return result;
      }).catch(reason => {manifestPromise = null; throw reason;});
    }
    return manifestPromise;
  }
  function removeImagery() {
    if (imagery && viewer && !viewer.isDestroyed()) viewer.imageryLayers.remove(imagery, true);
    imagery = null;
  }
  async function show() {
    const intent = ++generation;
    const data = await readManifest();
    const variant = data.variants.find(item => item.id === variantId);
    if (!variant) throw new Error('Unknown ground-motion variant');
    const provider = await Cesium.SingleTileImageryProvider.fromUrl(ROOT + variant.image, {
      rectangle: Cesium.Rectangle.fromDegrees(...variant.bounds),
      credit: new Cesium.Credit('NASA JPL OPERA / ASF DAAC · HeavenWatch derived LOS velocity'),
    });
    if (destroyed || intent !== generation || !enabled) return;
    removeImagery();
    imagery = viewer.imageryLayers.addImageryProvider(provider);
    imagery.alpha = opacity;
    error = null;
    render();
    notify();
  }
  return {
    id: 'ground-motion', name: 'Ground movement · OPERA', icon: '◈',
    source: 'NASA OPERA · 2016–2025 snapshot', updateInterval: 0,
    init(sceneViewer) { viewer = sceneViewer; return true; },
    attachMapStackController(value) { mapController = value; },
    async enable() {
      enabled = true;
      try {
        // Photoreal meshes obscure globe imagery. Satellite terrain is the supported raster view.
        if (mapController?.getActiveStack()?.id === 'photoreal') await mapController.setStack('esri-imagery');
        await show();
        return true;
      } catch (reason) {
        enabled = false; error = reason.message; removeImagery(); notify(); throw reason;
      }
    },
    disable() { enabled = false; generation++; removeImagery(); render(); notify(); return true; },
    destroy() { destroyed = true; controller.abort(); enabled = false; generation++; removeImagery(); values.clear(); listeners.clear(); return true; },
    update() { return true; },
    readManifest,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getState() { return {enabled, variantId, opacity, manifest, error}; },
    async setVariant(id) {
      const data = await readManifest();
      if (!data.variants.some(item => item.id === id)) throw new Error('Unknown ground-motion variant');
      const previous = variantId;
      variantId = id;
      try { if (enabled) await show(); } catch (reason) { variantId = previous; throw reason; }
      notify();
    },
    setOpacity(value) {
      if (!Number.isFinite(value)) return;
      opacity = Math.max(0, Math.min(1, value));
      if (imagery) imagery.alpha = opacity;
      render(); notify();
    },
    async flyTo() {
      const data = await readManifest();
      if (mapController?.getActiveStack()?.id === 'photoreal') await mapController.setStack('esri-imagery');
      viewer.camera.flyTo({destination: Cesium.Rectangle.fromDegrees(...data.variants[0].bounds), duration: 1.5});
    },
    async sample(longitude, latitude) {
      const data = await readManifest();
      const variant = data.variants.find(item => item.id === variantId);
      if (!values.has(variant.id)) {
        const response = await fetch(ROOT + variant.values, {signal: controller.signal});
        if (!response.ok) throw new Error('Pixel values are unavailable');
        values.set(variant.id, await response.arrayBuffer());
      }
      return {...sampleRaster(variant, values.get(variant.id), longitude, latitude), variant: variant.label};
    },
    getStats() {return {count: enabled ? 1 : 0, source: 'NASA OPERA · historical snapshot',
      coverage: 'Crane County · 2016–2025 · LOS mm/year', error};},
  };
}
