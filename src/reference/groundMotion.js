import * as Cesium from 'cesium';
import { recolorMotionTile } from './motionTile.js';
import { divergingColor } from './locationModel.js';
import { validateRaster, sampleRaster } from './raster.js';

const ROOT = '/reference-data/heavenwatch/';

export function createGroundMotionLayer() {
  let viewer,
    mapController,
    manifest,
    manifestPromise,
    imagery,
    enabled = false,
    destroyed = false;
  let reference = null,
    referenceValue = null,
    coverage = 'us',
    direction = 'ascending';
  let variantId = 'displacement',
    opacity = 0.7,
    generation = 0,
    error = null;
  const listeners = new Set();
  const values = new Map();
  const controller = new AbortController();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const render = () => viewer?.scene.requestRender();
  async function readManifest() {
    if (!manifestPromise) {
      manifestPromise = fetch(ROOT + 'manifest.json', {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok)
            throw new Error('Ground-motion snapshot is not installed');
          const result = await response.json();
          if (
            result.schemaVersion !== 1 ||
            !Array.isArray(result.variants) ||
            result.variants.length !== 2
          )
            throw new Error('Unsupported ground-motion snapshot');
          result.variants.forEach(validateRaster);
          manifest = result;
          return result;
        })
        .catch((reason) => {
          manifestPromise = null;
          throw reason;
        });
    }
    return manifestPromise;
  }
  function removeImagery() {
    if (imagery && viewer && !viewer.isDestroyed())
      viewer.imageryLayers.remove(imagery, true);
    imagery = null;
  }
  async function readValues(variant) {
    if (!values.has(variant.id)) {
      const response = await fetch(ROOT + variant.values, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Pixel values are unavailable');
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength !== variant.width * variant.height * 4)
        throw new Error('Raster byte count mismatch');
      values.set(variant.id, buffer);
    }
    return values.get(variant.id);
  }
  async function show() {
    const intent = ++generation;
    if (coverage === 'us') {
      const provider = new Cesium.UrlTemplateImageryProvider({
        url: `/api/reference/ground-motion/tiles/${direction === 'ascending' ? 'asc' : 'desc'}/{z}/{x}/{y}.png`,
        tilingScheme: new Cesium.WebMercatorTilingScheme(),
        maximumLevel: 12,
        credit: new Cesium.Credit(
          'NASA OPERA / ASF · short-wavelength LOS velocity',
        ),
      });
      // ASF tiles encode velocity in their red channel; apply the portal's diverging palette.
      const requestImage = provider.requestImage.bind(provider);
      provider.requestImage = (x, y, level, request) => {
        const result = requestImage(x, y, level, request);
        if (!result) return result;
        return Promise.resolve(result).then((image) => {
          return recolorMotionTile(image);
        });
      };
      if (destroyed || intent !== generation || !enabled) return;
      removeImagery();
      imagery = viewer.imageryLayers.addImageryProvider(provider);
      imagery.alpha = opacity;
      referenceValue = null;
      error = null;
      render();
      notify();
      return;
    }
    const data = await readManifest();
    const variant = data.variants.find((item) => item.id === variantId);
    if (!variant) throw new Error('Unknown ground-motion variant');
    let url = ROOT + variant.image;
    referenceValue = null;
    if (reference) {
      const buffer = await readValues(variant),
        base = sampleRaster(
          variant,
          buffer,
          reference.longitude,
          reference.latitude,
        );
      if (intent !== generation || !enabled || destroyed) return;
      if (base.status !== 'value') {
        removeImagery();
        error =
          'The movement reference is outside valid OPERA pixels. Choose a reference inside the Crane snapshot or clear it.';
        notify();
        return;
      }
      referenceValue = base.value;
      const canvas = document.createElement('canvas');
      canvas.width = variant.width;
      canvas.height = variant.height;
      const ctx = canvas.getContext('2d'),
        pixels = ctx.createImageData(variant.width, variant.height),
        view = new DataView(buffer);
      for (let i = 0; i < variant.width * variant.height; i++)
        pixels.data.set(
          divergingColor(view.getFloat32(i * 4, true) - base.value, 30),
          i * 4,
        );
      ctx.putImageData(pixels, 0, 0);
      url = canvas.toDataURL('image/png');
    }
    const provider = await Cesium.SingleTileImageryProvider.fromUrl(url, {
      rectangle: Cesium.Rectangle.fromDegrees(...variant.bounds),
      credit: new Cesium.Credit(
        'NASA JPL OPERA / ASF DAAC · HeavenWatch derived LOS velocity',
      ),
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
    id: 'ground-motion',
    name: 'Ground movement · OPERA',
    icon: '◈',
    source: 'NASA OPERA / ASF · US coverage',
    updateInterval: 0,
    init(sceneViewer) {
      viewer = sceneViewer;
      return true;
    },
    attachMapStackController(value) {
      mapController = value;
    },
    async enable() {
      enabled = true;
      try {
        // Photoreal meshes obscure globe imagery. Satellite terrain is the supported raster view.
        if (mapController?.getActiveStack()?.id === 'photoreal')
          await mapController.setStack('esri-imagery');
        await show();
        return true;
      } catch (reason) {
        enabled = false;
        error = reason.message;
        removeImagery();
        notify();
        throw reason;
      }
    },
    disable() {
      enabled = false;
      generation++;
      removeImagery();
      render();
      notify();
      return true;
    },
    destroy() {
      destroyed = true;
      controller.abort();
      enabled = false;
      generation++;
      removeImagery();
      values.clear();
      listeners.clear();
      return true;
    },
    update() {
      return true;
    },
    readManifest,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState() {
      return {
        enabled,
        variantId,
        opacity,
        manifest,
        error,
        reference,
        referenceValue,
        coverage,
        direction,
      };
    },
    async setCoverage(value) {
      if (!['us', 'crane'].includes(value)) throw Error('Unknown coverage');
      coverage = value;
      if (enabled) await show();
      else notify();
    },
    async setDirection(value) {
      if (!['ascending', 'descending'].includes(value))
        throw Error('Unknown orbit');
      direction = value;
      if (enabled) await show();
      else notify();
    },
    async setReference(point) {
      reference = point;
      if (enabled) await show();
      else notify();
    },
    async setVariant(id) {
      const data = await readManifest();
      if (!data.variants.some((item) => item.id === id))
        throw new Error('Unknown ground-motion variant');
      const previous = variantId;
      variantId = id;
      try {
        if (enabled) await show();
      } catch (reason) {
        variantId = previous;
        throw reason;
      }
      notify();
    },
    setOpacity(value) {
      if (!Number.isFinite(value)) return;
      opacity = Math.max(0, Math.min(1, value));
      if (imagery) imagery.alpha = opacity;
      render();
      notify();
    },
    async flyTo(region = 'us') {
      if (coverage === 'us') {
        viewer.camera.flyTo({
          destination: Cesium.Rectangle.fromDegrees(
            ...({
              us: [-125, 24, -66, 50],
              alaska: [-170, 52, -130, 71],
              hawaii: [-161, 18, -154, 23],
            }[region] || [-125, 24, -66, 50]),
          ),
          duration: 1.5,
        });
        return;
      }
      const data = await readManifest();
      if (mapController?.getActiveStack()?.id === 'photoreal')
        await mapController.setStack('esri-imagery');
      viewer.camera.flyTo({
        destination: Cesium.Rectangle.fromDegrees(...data.variants[0].bounds),
        duration: 1.5,
      });
    },
    async sample(longitude, latitude) {
      if (coverage === 'us')
        return {
          status: 'history',
          variant:
            'US overview · use Ground movement inspector for point history',
        };
      const data = await readManifest();
      const variant = data.variants.find((item) => item.id === variantId);
      if (!values.has(variant.id)) {
        const response = await fetch(ROOT + variant.values, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Pixel values are unavailable');
        values.set(variant.id, await response.arrayBuffer());
      }
      return {
        ...sampleRaster(variant, values.get(variant.id), longitude, latitude),
        variant: variant.label,
      };
    },
    getStats() {
      return {
        count: enabled ? 1 : 0,
        source: 'NASA OPERA · historical snapshot',
        coverage:
          coverage === 'us'
            ? 'US / ASF coverage · long-term LOS mm/year'
            : 'Crane County · 2016–2025 · LOS mm/year',
        error,
      };
    },
  };
}
