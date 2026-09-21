export const DENSITY_SCALE = [
  { min: 0, color: '#ffffcc', label: '<0.1' },
  { min: 0.1, color: '#c2e699', label: '0.1–<0.5' },
  { min: 0.5, color: '#78c679', label: '0.5–<1' },
  { min: 1, color: '#31a354', label: '1–<5' },
  { min: 5, color: '#006837', label: '5+' },
];
export function densityColor(value) {
  return (
    [...DENSITY_SCALE].reverse().find((s) => Number(value) >= s.min)?.color ||
    '#969696'
  );
}
