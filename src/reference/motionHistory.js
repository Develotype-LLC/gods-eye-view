/** Provider history is already stitched. Never splice distinct frames/orbits. */
export function historyWindow(points, period = 'year') {
  const valid = points.filter((p) => Number.isFinite(p.valueMm) && !p.masked);
  if (valid.length < 2) return { error: 'Fewer than two valid observations.' };
  const end = valid.at(-1),
    target = new Date(end.date);
  if (period === 'month') target.setUTCMonth(target.getUTCMonth() - 1);
  else if (period === 'year')
    target.setUTCFullYear(target.getUTCFullYear() - 1);
  else if (period === 'five')
    target.setUTCFullYear(target.getUTCFullYear() - 5);
  else if (period === 'ten')
    target.setUTCFullYear(target.getUTCFullYear() - 10);
  else if (period !== 'all') return { error: 'Unknown comparison period' };
  const first = Date.parse(valid[0].date);
  if (period !== 'all' && target.getTime() < first)
    return {
      error: 'This location does not have enough history for that period.',
    };
  const start =
    period === 'all'
      ? valid[0]
      : valid.reduce((a, b) =>
          Math.abs(Date.parse(a.date) - target) <=
          Math.abs(Date.parse(b.date) - target)
            ? a
            : b,
        );
  if (start === end)
    return { error: 'No earlier observation near the requested start date.' };
  const selected = valid.filter((p) => p.date >= start.date);
  const gaps = selected
    .slice(1)
    .map(
      (p, i) => (Date.parse(p.date) - Date.parse(selected[i].date)) / 86400000,
    );
  return {
    start: start.date,
    end: end.date,
    changeMm: end.valueMm - start.valueMm,
    points: selected.map((p) => ({
      ...p,
      relativeMm: p.valueMm - start.valueMm,
    })),
    days: (Date.parse(end.date) - Date.parse(start.date)) / 86400000,
    maxGapDays: Math.max(...gaps),
    startOffsetDays:
      period === 'all' ? 0 : (Date.parse(start.date) - target) / 86400000,
  };
}
