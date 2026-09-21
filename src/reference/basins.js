import * as Cesium from 'cesium';

export function createBasinsLayer() {
  let viewer,
    source,
    panel,
    select,
    description,
    generation = 0;
  const groups = new Map();
  const color = Cesium.Color.fromCssColorString('#a8b9c3');
  const layer = {
    id: 'us-basins',
    name: 'US geological basins',
    icon: '◈',
    source: 'USGS sedimentary basins',
    updateInterval: 0,
    init(v) {
      viewer = v;
      panel = document.createElement('section');
      panel.id = 'basins-panel';
      panel.hidden = true;
      panel.style.cssText =
        'position:fixed;right:16px;bottom:70px;z-index:30;background:#101c28ee;color:#eee;border:1px solid #e6b96b;padding:14px;width:280px;max-width:80vw;font:13px sans-serif;border-radius:8px';
      const title = document.createElement('strong');
      title.textContent = 'US GEOLOGICAL BASINS';
      title.style.cssText = 'display:block;margin-bottom:10px';
      const label = document.createElement('label');
      label.textContent = 'Select a basin';
      select = document.createElement('select');
      select.setAttribute('aria-label', 'Select geological basin');
      select.style.cssText =
        'display:block;width:100%;margin:10px 0;color:#eee;background:#182c3b';
      description = document.createElement('p');
      const note = document.createElement('small');
      note.textContent =
        'USGS · regional sedimentary boundaries, including offshore areas. Simplified for display; not leases or formation limits. Hide using Data Layers.';
      label.append(select);
      panel.append(title, label, description, note);
      document.body.append(panel);
      select.addEventListener('change', () => {
        const members = groups.get(select.value);
        const entity = members?.[0];
        if (!entity) return;
        const p = entity.properties.getValue(viewer.clock.currentTime);
        description.textContent = [
          p.basintype,
          p.era,
          p.source_scl && `Source scale ${p.source_scl}`,
        ]
          .filter(Boolean)
          .join(' · ');
        void viewer.flyTo(members, { duration: 1.4 });
      });
      return true;
    },
    async enable() {
      const intent = ++generation;
      const loaded = await Cesium.GeoJsonDataSource.load(
        '/reference-data/basins/usgs-basins.geojson',
        {
          clampToGround: true,
          fill: color.withAlpha(0.025),
          stroke: color,
          strokeWidth: 2,
        },
      );
      if (intent !== generation) return false;
      source = loaded;
      source.name = 'USGS geological basins';
      const options = [];
      groups.clear();
      for (const entity of [...source.entities.values]) {
        if (!entity.polygon) continue;
        const p = entity.properties.getValue(viewer.clock.currentTime);
        entity.name = p.name;
        entity.polygon.classificationType = Cesium.ClassificationType.BOTH;
        entity.polygon.outline = false;
        const hierarchy = entity.polygon.hierarchy.getValue(
          viewer.clock.currentTime,
        );
        const addRing = (ring) => {
          source.entities.add({
            polyline: {
              positions: [...ring.positions, ring.positions[0]],
              width: 1.5,
              material: color.withAlpha(0.7),
              clampToGround: true,
              classificationType: Cesium.ClassificationType.BOTH,
            },
          });
          for (const hole of ring.holes || []) addRing(hole);
        };
        addRing(hierarchy);
        const key = String(p.OBJECTID);
        if (!groups.has(key)) {
          groups.set(key, []);
          options.push({ id: key, name: p.name });
        }
        groups.get(key).push(entity);
      }
      await viewer.dataSources.add(source);
      select.replaceChildren(
        new Option('Choose a basin…', ''),
        ...options
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((o) => new Option(o.name, o.id)),
      );
      description.textContent =
        'National coverage · contiguous US, Alaska and Hawaii';
      panel.hidden = false;
      viewer.scene.requestRender();
      return true;
    },
    disable() {
      generation++;
      if (source && !viewer.isDestroyed())
        viewer.dataSources.remove(source, true);
      source = null;
      groups.clear();
      if (panel) panel.hidden = true;
      return true;
    },
    destroy() {
      this.disable();
      panel?.remove();
      return true;
    },
    update() {
      return true;
    },
    flyTo() {
      viewer.camera.flyTo({
        destination: Cesium.Rectangle.fromDegrees(-125, 24, -66, 50),
        duration: 1.5,
      });
    },
    getStats() {
      return { count: 144, source: 'USGS · national sedimentary basins' };
    },
  };
  return layer;
}
