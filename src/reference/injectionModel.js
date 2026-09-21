export function validateInjection(data) {
  if (data?.schemaVersion !== 1 || !Array.isArray(data.wells) || data.wells.length > 5000) throw new Error('Invalid injection snapshot');
  const ids = new Set();
  for (const well of data.wells) {
    if (!/^42\d{12}$/.test(well.id) || ids.has(well.id) || !Number.isFinite(well.longitude) || !Number.isFinite(well.latitude) || Math.abs(well.longitude) > 180 || Math.abs(well.latitude) > 90 || !Array.isArray(well.history)) throw new Error('Invalid well record');
    ids.add(well.id);
    let previous = '';
    for (const row of well.history) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month) || row.month <= previous || !Number.isFinite(row.bbl) || row.bbl < 0) throw new Error('Invalid monthly history');
      previous = row.month;
    }
  }
  return data;
}
export function injectionAt(well, month) {
  return well.history.find(row => row.month === month) ?? null;
}
export function injectionMonthSummary(wells, month) {
  const rows = wells.map(well => injectionAt(well, month)).filter(Boolean);
  return {reportingWells: rows.length, bbl: rows.reduce((sum, row) => sum + row.bbl, 0)};
}
