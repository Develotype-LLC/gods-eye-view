export function etSelection(observations, period, kind = 'ET') {
  const rows = observations.filter((r) => r.kind === kind);
  const selected = rows.filter(
    (r) =>
      r.period === period &&
      r.value !== null &&
      r.value !== undefined &&
      Number.isFinite(Number(r.value)),
  );
  return {
    value: selected.length
      ? selected.reduce((n, r) => n + Number(r.value), 0) / selected.length
      : null,
    period,
    kind,
    history: [...rows].sort((a, b) => a.period.localeCompare(b.period)),
  };
}
export function readableFacts(properties = {}) {
  const labels = {
    acres: 'Area · acres',
    area_acres: 'Area · acres',
    crop_name: 'Crop',
    crop: 'Crop',
    county: 'County',
    county_name: 'County',
    name: 'Name',
    operator: 'Reported operator',
    operator_name: 'Reported operator',
    status: 'Source status',
    magnitude: 'Magnitude',
    depth_km: 'Depth · km',
    observed_date: 'Observation date',
    date: 'Source date',
    year: 'Year',
    area_m2: 'Area · m²',
    volume_bbl: 'Volume · bbl',
  };
  return Object.entries(labels)
    .filter(
      ([key]) =>
        properties[key] != null &&
        properties[key] !== '' &&
        typeof properties[key] !== 'object',
    )
    .map(([key, label]) => [
      label,
      typeof properties[key] === 'number'
        ? properties[key].toLocaleString(undefined, {
            maximumFractionDigits: 2,
          })
        : String(properties[key]),
    ]);
}
