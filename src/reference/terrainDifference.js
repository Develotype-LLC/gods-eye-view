import * as Cesium from 'cesium';
import { divergingColor } from './locationModel.js';
export function createTerrainDifferenceLayer() {
  let viewer,
    mapController,
    enabled = false,
    reference = null,
    range = 100,
    material,
    previous;
  const listeners = new Set(),
    notify = () => listeners.forEach((fn) => fn());
  function paint() {
    if (!enabled || !reference) {
      if (viewer && material && viewer.scene.globe.material === material)
        viewer.scene.globe.material = previous;
      notify();
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 1;
    const ctx = canvas.getContext('2d'),
      pixels = ctx.createImageData(256, 1);
    for (let x = 0; x < 256; x++)
      pixels.data.set(
        divergingColor(((x / 255) * 2 - 1) * range, range),
        x * 4,
      );
    ctx.putImageData(pixels, 0, 0);
    material = Cesium.Material.fromType('ElevationRamp', {
      image: canvas,
      minimumHeight: reference.ellipsoid - range,
      maximumHeight: reference.ellipsoid + range,
    });
    viewer.scene.globe.material = material;
    viewer.scene.requestRender();
    notify();
  }
  return {
    id: 'terrain-difference',
    name: 'Terrain elevation · relative to A',
    icon: '◈',
    source: 'Re:Earth terrain · ellipsoidal height',
    updateInterval: 0,
    init(v) {
      viewer = v;
      return true;
    },
    attachMapStackController(c) {
      mapController = c;
    },
    async enable() {
      if (mapController?.getActiveStack()?.id === 'photoreal')
        await mapController.setStack('esri-imagery');
      if (viewer.terrainProvider instanceof Cesium.EllipsoidTerrainProvider)
        throw new Error(
          'Terrain is unavailable; elevation heat map cannot use a flat globe.',
        );
      previous = viewer.scene.globe.material;
      enabled = true;
      paint();
      return true;
    },
    disable() {
      enabled = false;
      if (viewer && material && viewer.scene.globe.material === material)
        viewer.scene.globe.material = previous;
      viewer?.scene.requestRender();
      notify();
      return true;
    },
    destroy() {
      this.disable();
      listeners.clear();
      return true;
    },
    update() {
      return true;
    },
    setReference(point) {
      reference = point;
      paint();
    },
    setRange(value) {
      if (!Number.isFinite(value) || value < 10 || value > 2000) return;
      range = value;
      paint();
    },
    getState() {
      return { enabled, reference, range };
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getStats() {
      return {
        count: enabled && reference ? 1 : 0,
        source: 'Re:Earth terrain',
        coverage: reference
          ? 'Elevation relative to point A, metres'
          : 'Set a reference point A',
      };
    },
  };
}
