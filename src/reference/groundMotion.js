import * as Cesium from 'cesium';
import { recolorMotionTile } from './motionTile.js';
import { divergingColor } from './locationModel.js';
import { validateRaster, sampleRaster } from './raster.js';

const ROOT = '/reference-data/heavenwatch/';
const PERIOD_ROOT = '/reference-data/motion-periods/';

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
  let mapPeriod = 'year',
    periodManifest,
    periodPromise;
  const periodImagery = [];
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
  async function readPeriods() {
    if (!periodPromise)
      periodPromise = fetch(PERIOD_ROOT + 'manifest.json', {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok)
            throw Error('Permian change maps are not installed');
          const data = await response.json();
          if (data.schemaVersion !== 1 || !Array.isArray(data.variants))
            throw Error('Invalid period manifest');
          data.variants
            .filter((item) => item.available)
            .forEach(validateRaster);
          periodManifest = data;
          return data;
        })
        .catch((error) => {
          periodPromise = null;
          throw error;
        });
    return periodPromise;
  }
  function removeImagery() {
    for (const item of periodImagery.splice(0))
      if (viewer && !viewer.isDestroyed())
        viewer.imageryLayers.remove(item, true);
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
    if (coverage === 'permian') {
      const data = await readPeriods();
      const rasters = data.variants.filter(
        (item) => item.period === mapPeriod && item.available,
      );
      if (!rasters.length)
        throw Error('No observations available for this map period');
      const providers = await Promise.all(
        rasters.map((item) =>
          Cesium.SingleTileImageryProvider.fromUrl(PERIOD_ROOT + item.image, {
            rectangle: Cesium.Rectangle.fromDegrees(...item.bounds),
            credit: new Cesium.Credit(
              'NASA OPERA · HeavenWatch dated displacement · Permian pilot',
            ),
          }),
        ),
      );
      if (destroyed || intent !== generation || !enabled) return;
      removeImagery();
      for (const provider of providers) {
        const item = viewer.imageryLayers.addImageryProvider(provider);
        item.alpha = opacity;
        periodImagery.push(item);
      }
      referenceValue = null;
      error = null;
      render();
      notify();
      return;
    }
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
    readPeriods,
    async setMapPeriod(value) {
      if (!['month', 'year', 'five'].includes(value))
        throw Error('This map period is unavailable');
      const previous = mapPeriod;
      mapPeriod = value;
      try {
        if (enabled && coverage === 'permian') await show();
        else notify();
      } catch (error) {
        mapPeriod = previous;
        notify();
        throw error;
      }
    },
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
        mapPeriod,
        periodManifest,
      };
    },
    async setCoverage(value) {
      if (!['us', 'crane', 'permian'].includes(value))
        throw Error('Unknown coverage');
      const previous = coverage;
      coverage = value;
      try {
        if (enabled) await show();
        else notify();
      } catch (error) {
        coverage = previous;
        notify();
        throw error;
      }
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
      for (const item of periodImagery) item.alpha = opacity;
      render();
      notify();
    },
    async flyTo(region = 'us') {
      if (coverage === 'permian') {
        const data = await readPeriods();
        const raster = data.variants.find(
          (item) => item.available && item.area === region,
        );
        viewer.camera.flyTo({
          destination: Cesium.Rectangle.fromDegrees(
            ...(raster?.bounds || [-104.1, 30.95, -102.15, 31.95]),
          ),
          duration: 1.5,
        });
        return;
      }
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
      if (coverage === 'permian') {
        const data = await readPeriods();
        for (const variant of data.variants.filter(
          (item) => item.period === mapPeriod && item.available,
        )) {
          const [w, s, e, n] = variant.bounds;
          if (longitude < w || longitude >= e || latitude <= s || latitude > n)
            continue;
          const key = 'period:' + variant.id;
          if (!values.has(key)) {
            const response = await fetch(PERIOD_ROOT + variant.values, {
              signal: controller.signal,
            });
            if (!response.ok) throw Error('Change values unavailable');
            values.set(key, await response.arrayBuffer());
          }
          return {
            ...sampleRaster(variant, values.get(key), longitude, latitude),
            units: 'mm LOS',
            startDate: variant.startDate,
            endDate: variant.endDate,
            area: variant.name,
          };
        }
        return { status: 'outside', units: 'mm LOS' };
      }
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
          coverage === 'permian'
            ? 'Permian pilot · dated LOS change in mm'
            : coverage === 'us'
              ? 'US / ASF coverage · long-term LOS mm/year'
              : 'Crane County · 2016–2025 · LOS mm/year',
        error,
      };
    },
  };
}
