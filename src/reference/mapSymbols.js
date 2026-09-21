/** Shared map/legend symbols. Quantities have their own scale, not asset colors. */
export const ET_COLORS = [
  '#deebf7',
  '#9ecae1',
  '#6baed6',
  '#3182bd',
  '#2171b5',
];
export const NO_OBSERVATION = '#969696';
export function etColor(value) {
  if (value == null || !Number.isFinite(Number(value))) return NO_OBSERVATION;
  const index = Math.min(4, Math.floor(Math.max(0, Number(value)) / 60));
  return ET_COLORS[index];
}
const shapes = {
  'nm-water': '<rect x="5" y="5" width="14" height="14" rx="1"/>',
  'nm-disposal': '<path d="M12 3L22 21H2Z"/>',
  'texnet-injection': '<path d="M3 4H21L12 21Z"/>',
  ponds: '<path d="M12 2L22 12L12 22L2 12Z"/>',
  tanks: '<path d="M6 3H18L22 12L18 21H6L2 12Z"/>',
  'cooling-water':
    '<rect x="4" y="4" width="16" height="16"/><path d="M4 12H20M12 4V20" fill="none"/>',
  flares: '<path d="M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9Z"/>',
  'rrc-plugging':
    '<path d="M5 2L12 9L19 2L22 5L15 12L22 19L19 22L12 15L5 22L2 19L9 12L2 5Z"/>',
  'rrc-inactive':
    '<circle cx="12" cy="12" r="8" fill="none" stroke-width="3"/>',
};
const cache = new Map();
export function assetSymbol(id, color = '#ffffff') {
  const key = id + color;
  if (!cache.has(key)) {
    const shape = shapes[id] || '<circle cx="12" cy="12" r="7"/>';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="${color}" stroke="#111b24" stroke-width="4" stroke-linejoin="round">${shape}</g><g fill="${color}" stroke="${color}" stroke-width="1" stroke-linejoin="round">${shape}</g></svg>`;
    cache.set(
      key,
      'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
    );
  }
  return cache.get(key);
}
