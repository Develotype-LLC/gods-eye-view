/** Equal-area cells are anchored at EPSG:5070 origin, not at the viewport.
 * Query whole intersecting cells so panning cannot trim their counts.
 */
export function densityOptions(params) {
  const view = params.get('view') || 'auto';
  const cellKm = Number(params.get('cellKm') || 25);
  if (
    !['auto', 'density', 'locations'].includes(view) ||
    ![10, 25, 50].includes(cellKm)
  )
    throw Error('Invalid density options');
  return { view, cellKm };
}
export async function wellDensity(query, bounds, category, cellKm) {
  // EPSG:5070 is intended for CONUS. Bound the viewport to the Texas inventory.
  const b = [
    Math.max(-107, bounds[0]),
    Math.max(25, bounds[1]),
    Math.min(-93, bounds[2]),
    Math.min(37, bounds[3]),
  ];
  if (b[0] >= b[2] || b[1] >= b[3]) return [];
  const { rows } = await query(
    `WITH view_box AS (
    SELECT ST_Envelope(ST_Transform(ST_Segmentize(ST_MakeEnvelope($1,$2,$3,$4,4326),0.25),5070)) AS g
  ), extent AS (
    SELECT floor(ST_XMin(g)/$6)*$6 AS west,floor(ST_YMin(g)/$6)*$6 AS south,
      (floor(ST_XMax(g)/$6)+1)*$6 AS east,(floor(ST_YMax(g)/$6)+1)*$6 AS north FROM view_box
  ), grid_box AS (
    SELECT *,ST_Envelope(ST_Transform(ST_Segmentize(ST_MakeEnvelope(west,south,east,north,5070),1000),4326)) AS g FROM extent
  ), points AS MATERIALIZED (
    SELECT ST_Transform(w.geom,5070) AS g FROM landman.well_location w,grid_box b
    WHERE w.run_id=(SELECT run_id FROM landman.dataset WHERE name='gis') AND w.geom && b.g AND ($5='' OR w.category=$5)
  ), cells AS (
    SELECT floor(ST_X(p.g)/$6)*$6 AS x,floor(ST_Y(p.g)/$6)*$6 AS y,count(*)::int AS count
    FROM points p,extent b WHERE ST_X(p.g)>=b.west AND ST_X(p.g)<b.east AND ST_Y(p.g)>=b.south AND ST_Y(p.g)<b.north GROUP BY 1,2
  ), shapes AS (
    SELECT *,ST_Transform(ST_Segmentize(ST_MakeEnvelope(x,y,x+$6,y+$6,5070),5000),4326) AS g FROM cells
  ) SELECT x,y,count,count/($6*$6/1000000.0) AS density,ST_AsGeoJSON(g,6)::json AS geometry,
    ST_XMin(g) AS west,ST_YMin(g) AS south,ST_XMax(g) AS east,ST_YMax(g) AS north FROM shapes ORDER BY x,y`,
    [...b, category, cellKm * 1000],
  );
  return rows;
}

/** Cache whole inventory cells by import version; never cache a clipped viewport. */
export function densityCache(query, { maxEntries = 8 } = {}) {
  const cache = new Map();
  return async (bounds, category, cellKm) => {
    const { rows } = await query("SELECT run_id::text AS version FROM landman.dataset WHERE name='gis'");
    const version = rows[0]?.version;
    if (!version) return [];
    const key = JSON.stringify([version, category, cellKm]);
    let entry = cache.get(key);
    if (!entry) {
      entry = wellDensity((sql, args) => query(
        sql.replace("(SELECT run_id FROM landman.dataset WHERE name='gis')", '$7'),
        [...args, version],
      ), [-107,25,-93,37], category, cellKm);
      cache.set(key, entry);
      while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
      entry.catch(() => { if (cache.get(key) === entry) cache.delete(key); });
    }
    const cells = await entry;
    return cells.filter(c => c.east >= bounds[0] && c.west <= bounds[2] && c.north >= bounds[1] && c.south <= bounds[3]);
  };
}
