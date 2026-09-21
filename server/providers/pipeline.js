import { distance } from '../../src/reference/pipelineModel.js';
export function validateCorridors(body) {
  if (
    !body ||
    !Array.isArray(body.routes) ||
    !body.routes.length ||
    body.routes.length > 7 ||
    !Number.isFinite(body.width) ||
    body.width < 3 ||
    body.width > 153
  )
    throw Error('Invalid route corridors');
  const ids = new Set();
  for (const r of body.routes) {
    if (
      typeof r.id !== 'string' ||
      !/^route-[0-6]$/.test(r.id) ||
      ids.has(r.id) ||
      !Array.isArray(r.coordinates) ||
      r.coordinates.length < 2 ||
      r.coordinates.length > 1500
    )
      throw Error('Invalid route geometry');
    ids.add(r.id);
    for (const p of r.coordinates)
      if (
        !Array.isArray(p) ||
        p.length !== 2 ||
        p.some((v) => !Number.isFinite(v)) ||
        p[0] < -107 ||
        p[0] > -93 ||
        p[1] < 25 ||
        p[1] > 37
      )
        throw Error('Invalid route coordinates');
    if (
      r.coordinates
        .slice(1)
        .reduce((n, p, i) => n + distance(r.coordinates[i], p), 0) > 400000
    )
      throw Error('Invalid route length');
  }
  return body;
}
export async function analyzeCorridors(query, body) {
  const { routes, width } = validateCorridors(body),
    results = [];
  for (const route of routes) {
    const args = [
      JSON.stringify({ type: 'LineString', coordinates: route.coordinates }),
      width / 2,
    ];
    const base = `WITH route AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1),4326) AS line), corridor AS (SELECT line,ST_Buffer(line::geography,$2)::geometry AS geom FROM route), hits AS MATERIALIZED (SELECT p.id,p.geom,c.name AS county,s.metadata FROM landman.land_parcel p JOIN landman.land_county c ON c.snapshot_id=p.snapshot_id JOIN landman.land_snapshot s ON s.id=p.snapshot_id CROSS JOIN corridor r WHERE cardinality(p.basins)>0 AND p.geom && r.geom AND ST_Intersects(p.geom,r.geom) LIMIT 3001)`;
    const count = Number(
      (await query(base + ' SELECT count(*)::int AS n FROM hits', args)).rows[0]
        .n,
    );
    if (count > 3000) {
      results.push({
        id: route.id,
        truncated: true,
        parcelCount: count,
        ownerCount: null,
        unknownParcels: null,
        coverage: 0,
        owners: [],
        sources: [],
      });
      continue;
    }
    const summary = (
      await query(
        base +
          ` SELECT count(*)::int AS parcels,COALESCE(ST_Length(ST_CollectionExtract(ST_Intersection((SELECT line FROM corridor),ST_UnaryUnion(ST_Collect(geom))),2)::geography)/NULLIF(ST_Length((SELECT line FROM corridor)::geography),0),0) AS coverage FROM hits`,
        args,
      )
    ).rows[0];
    const owners = (
      await query(
        base +
          ` SELECT a.owner_key,min(a.raw_owner) AS name,count(DISTINCT a.parcel_id)::int AS parcels,array_agg(DISTINCT h.county) AS counties,min(a.parcel_id)::text AS sample_parcel FROM hits h JOIN landman.land_account a ON a.parcel_id=h.id GROUP BY a.owner_key ORDER BY count(DISTINCT a.parcel_id) DESC,a.owner_key`,
        args,
      )
    ).rows;
    const unknown = Number(
      (
        await query(
          base +
            ` SELECT count(*)::int AS n FROM hits h WHERE NOT EXISTS(SELECT 1 FROM landman.land_account a WHERE a.parcel_id=h.id) OR EXISTS(SELECT 1 FROM landman.land_account a WHERE a.parcel_id=h.id AND a.owner_key='OWNER NOT SUPPLIED')`,
          args,
        )
      ).rows[0].n,
    );
    const sources = (
      await query(
        base +
          " SELECT DISTINCT county,metadata->'sourceDates' AS dates,metadata->>'sourceUrl' AS url FROM hits ORDER BY county",
        args,
      )
    ).rows;
    results.push({
      id: route.id,
      truncated: false,
      parcelCount: summary.parcels,
      ownerCount: owners.filter((o) => o.owner_key !== 'OWNER NOT SUPPLIED')
        .length,
      unknownParcels: unknown,
      coverage: Math.min(1, Number(summary.coverage)),
      owners,
      sources,
    });
  }
  return {
    results,
    at: new Date().toISOString(),
    note: 'Appraisal name counts are not verified legal parties or contracts. Coverage is centerline length intersecting imported parcel polygons, not right-of-way clearance.',
  };
}
