export const LANDMAN_MODE_KEY = 'landman:workspace:v1';
export function initialLandmanMode({
  search = '',
  hasShareState = false,
  preference = null,
} = {}) {
  const requested = new URLSearchParams(search).get('view');
  if (requested === 'landman') return true;
  if (requested === 'console' || hasShareState) return false;
  return preference !== 'console';
}
export const LANDMAN_LAYERS = [
  {
    id: 'texas-wells',
    group: 'Oil & gas',
    name: 'Texas wells',
    source: 'RRC · statewide inventory',
    tag: 'Statewide',
    color: '#e6bd76',
    inspector: 'texas-panel',
  },
  {
    id: 'rrc-inactive',
    dataset: true,
    group: 'Oil & gas',
    name: 'Inactive wells',
    source: 'RRC · August 2026',
    tag: 'Snapshot',
    color: '#f1a2d2',
  },
  {
    id: 'rrc-plugging',
    dataset: true,
    group: 'Oil & gas',
    name: 'Plugging history',
    source: 'RRC · 2015–2026',
    tag: 'History',
    color: '#aaa6f5',
  },
  {
    id: 'texnet-injection',
    dataset: true,
    group: 'Oil & gas',
    name: 'Injection reporting',
    source: 'TexNet · reporting subset',
    tag: 'History',
    color: '#c197ff',
  },
  {
    id: 'terrain-difference',
    group: 'Geology & movement',
    name: 'Terrain elevation',
    source: 'Terrain · height relative to point A',
    tag: 'Comparison',
    color: '#dc9956',
    inspector: 'location-panel',
  },
  {
    id: 'us-basins',
    group: 'Geology & movement',
    name: 'Geological basins',
    source: 'USGS · national boundaries',
    tag: 'National',
    color: '#e6b96b',
    inspector: 'basins-panel',
  },
  {
    id: 'texnet-seismic',
    dataset: true,
    group: 'Geology & movement',
    name: 'Earthquakes',
    source: 'TexNet · reviewed events',
    tag: 'Snapshot',
    color: '#ff7b64',
  },
  {
    id: 'ground-motion',
    group: 'Geology & movement',
    name: 'Ground movement',
    source: 'NASA OPERA / ASF · United States',
    tag: 'US coverage',
    color: '#ad93e7',
    inspector: 'ground-motion-legend',
  },
  {
    id: 'ponds',
    dataset: true,
    group: 'Water & infrastructure',
    name: 'Pond candidates',
    source: 'Imagery · inferred attribution',
    tag: 'Estimated',
    color: '#42d9cf',
  },
  {
    id: 'nm-water',
    dataset: true,
    group: 'Water & infrastructure',
    name: 'Water facilities',
    source: 'NM OCD · regulatory points',
    tag: 'New Mexico',
    color: '#55baff',
  },
  {
    id: 'nm-disposal',
    dataset: true,
    group: 'Water & infrastructure',
    name: 'Disposal wells · NM',
    source: 'NM OCD · status retained',
    tag: 'New Mexico',
    color: '#efbc68',
  },
  {
    id: 'tanks',
    dataset: true,
    group: 'Water & infrastructure',
    name: 'Storage tanks',
    source: 'Published imagery detections',
    tag: 'Detected',
    color: '#d7bd8b',
  },
  {
    id: 'cooling-water',
    dataset: true,
    group: 'Water & infrastructure',
    name: 'Cooling-water demand',
    source: 'EIA · 2018 facility records',
    tag: 'Historical',
    color: '#73b7ec',
  },
  {
    id: 'flares',
    dataset: true,
    group: 'Activity & water use',
    name: 'Annual flares',
    source: 'VIIRS · 2024 detections',
    tag: 'Historical',
    color: '#ffc24b',
  },
  {
    id: 'openet',
    dataset: true,
    group: 'Activity & water use',
    name: 'Evapotranspiration',
    source: 'OpenET · 42 fields · 2018',
    tag: 'Lubbock pilot',
    color: '#77db88',
  },
];
export const LANDMAN_VIEWS = [
  {
    id: 'overview',
    name: 'Overview',
    description: 'Texas wells and geological context',
    layers: ['texas-wells', 'us-basins'],
    bounds: [-106.7, 25.7, -93.4, 36.6],
    inspector: null,
  },
  {
    id: 'water',
    name: 'Water',
    description: 'Disposal, ponds and water facilities',
    layers: ['texnet-injection', 'ponds', 'nm-water', 'nm-disposal'],
    bounds: [-105, 30, -100.5, 34],
    inspector: 'nm-water',
  },
  {
    id: 'history',
    name: 'Well history',
    description: 'Inactive inventory and physical plugging actions',
    layers: ['rrc-inactive', 'rrc-plugging'],
    bounds: [-106.7, 25.7, -93.4, 36.6],
    inspector: 'rrc-inactive',
  },
  {
    id: 'movement',
    name: 'Ground movement',
    description: 'US OPERA ground motion; TexNet earthquakes in Texas',
    layers: ['ground-motion', 'texnet-seismic'],
    bounds: [-125, 24, -66, 50],
    inspector: 'ground-motion',
  },
  {
    id: 'et',
    name: 'ET fields',
    description: 'Actual and reference evapotranspiration · 2018',
    layers: ['openet'],
    bounds: [-101.965, 33.537, -101.85, 33.627],
    inspector: 'openet',
  },
];
export function filterLandmanLayers(
  query = '',
  activeOnly = false,
  enabled = () => false,
) {
  const term = query.trim().toLowerCase();
  return LANDMAN_LAYERS.filter(
    (l) =>
      (!activeOnly || enabled(l)) &&
      [l.name, l.source, l.group, l.tag].join(' ').toLowerCase().includes(term),
  );
}
