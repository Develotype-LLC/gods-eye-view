# Existing local projects for LANDMAN’S Eye

Inspected 2026-09-21 UTC. This inventory records local files and implementations, not live upstream freshness or a completed import into LANDMAN’S Eye. Other projects were inspected read-only; no external database connectivity was tested.

## Reuse direction

### Additional database discovery

A deeper filesystem search found `/Users/brian/uplabs/xon/recursivewater/datapack/rrc_texas.sqlite` (217 MiB). Read-only SQL verified these populated tables on 2026-09-21:

| Table | Rows | Meaning |
|---|---:|---|
| `source_manifest` | 286 | Source archive paths, dates, sizes and hashes |
| `operator` | 7,635 | Operator directory |
| `plug_action` | 87,159 | Plugging actions, physical years 2015–2026; not necessarily distinct wells |
| `iwar_record` | 121,221 | Raw inactive inventory rows, snapshot 2026-08-10 |
| `iwar_well` | 117,169 | Inactive inventory well projection |
| `permian_current_well_status` | 84,658 | Reconciled regional status projection, dated source semantics |
| `permian_operator_county_year` | 25,194 | Operator/county/year production, not per-well production |
| `w10_test` | 312,331 | Oil well test rows; daily test rates are not annual volumes |
| `g10_test` | 171,338 | Gas well test rows; daily test rates are not annual volumes |
| `well_location` | 6,131 | Partial geocoded subset with original datum and transformation metadata |

The associated `recursivewater/data/rrc/raw/` also contains downloaded full-wellbore data (367.9 MiB), P-4 history (198.3 MiB), inactive inventories (84.8 MiB), EWA wellbore snapshots (4,207.5 MiB), and 254 county well-layer archive files (168.4 MiB). The manifest records full-wellbore/P-4 snapshots dated 2026-08-22 and EWA captures through 2026-08-04. File counts alone do not prove statewide coverage or parser completeness.

These are a strong first source for enriching the new statewide map by API8 with inactive status and plugging history. Import dated source-specific tables; preserve actions versus wells and observed versus derived status. Do not replace newer GIS coordinates with this database's much smaller geocoded subset. The folder README still describes an earlier decision/spec stage; actual database contents are more extensive than that description.

Downloaded New Mexico GOTECH ZIP archives were also found under `recursivewater/outputs/01a03e88-ebfa-7430-b3e7-1c65998e6523/raw_cache/nm_gotech/`, including `wcproduction.zip` (923.6 MiB), `wellhistory.zip` (42.1 MiB), and `wchistory.zip` (38.6 MiB). Their internal records have not been validated in this inspection. The referenced external `/Volumes/T9/uplabs` path is not currently available.

Use `/Users/brian/uplabs/produced-water-data-platform` as the starting point for regulatory ingestion contracts and lineage. Keep the dedicated container 110 PostGIS database as LANDMAN’S Eye’s serving database. Reuse source captures and adapters through explicit imports rather than creating another competing definition of wells, permits, and water movement. Whether the existing platform database should become the shared backend requires inspecting its actual runtime and deployment first.

The new statewide GIS inventory is broader than the existing Basin Atlas disposal extract. Preserve it. Reconcile overlapping UIC records by source identifier and acquisition date; do not append older copies as new wells. Monthly H-10, annual aggregates, permits, GIS locations, and lease-level filings have different grains.

## Verified local assets

Counts below were read from JSON/GeoJSON arrays, CSV rows, or read-only SQLite queries during this inspection.

| Project / local artifact | Verified records | Use and limits |
|---|---:|---|
| `uplabs/basin-atlas/data/generated/texas-rrc-disposal.json` | 20,783 assets | Existing regulatory adapter; reconcile against newer statewide inventory. |
| `uplabs/basin-atlas/data/generated/nm-ocd-disposal.json` | 5,114 assets | New Mexico injection/disposal expansion; review source classifications. |
| `uplabs/basin-atlas/data/generated/texas-uic-depth-screen.json` | 20,299 profiles | Depth enrichment, not authoritative permit population or safe capacity. |
| `uplabs/basin-atlas/data/generated/ast-storage-tanks.json` | 8,892 assets | Published model detections; do not imply ownership, contents, or measured capacity. |
| `uplabs/basin-atlas/data/generated/viirs-flares.json` | 1,850 assets | Captured annual flare context; first record links the 2024 release, not live flare status. |
| `uplabs/basin-atlas/data/generated/hifld-permian-live.json` | 25 assets | Bounded electrical infrastructure extract, not complete coverage. |
| `uplabs/basin-atlas/data/generated/open-road-context.json` | 80 assets | Bounded road context. |
| `uplabs/basin-atlas/data/generated/stanford-permian-sample.json` | 60 assets | Published pad/tank detection sample. |
| `upsoft/science-data/files/h10_annual_all.csv` | 360,102 rows | Historical annual injection aggregate; retain UIC leading zeros, year and months. |
| `upsoft/science-data/files/rrc_uic_permian_screened.csv` | 20,621 rows | Screening enrichment only. |
| `upsoft/science-data/files/permian_seismicity_usgs.csv` | 3,069 events | Historical seismic layer; audit event identifiers, date range and duplicates. |
| `uplabs/xon/welldata/data/produced_water.sqlite` | 16,630 samples; 9,798 well summaries | USGS chemistry layer; preserve sample date, units, analytes and missing values. Root-level `produced_water.sqlite` is an empty placeholder; use the `data/` database. |
| `uplabs/Exxon_Permian_Offline/geojson/exxon_wells.geojson` | 33,639 features | Curated company-family overlay; source vintage and attribution need to remain visible. |
| `uplabs/Exxon_Permian_Offline/geojson/exxon_injection_wells.geojson` | 2,854 features | Separate disposal from enhanced-recovery injection. |
| `uplabs/Exxon_Permian_Offline/geojson/disposal_market_all_operators.geojson` | 8,678 features | Historical market analysis, not live capacity. |
| `uplabs/Exxon_Permian_Offline/geojson/ponds.geojson` | 52 features | Ownership partly inferred; volumes modeled from assumed depths. |
| `uplabs/Exxon_Permian_Offline/geojson/land_footprint_sections.geojson` | 5,430 features | Well-containing sections, not leasehold or mineral ownership. |
| `uplabs/Exxon_Permian_Offline/geojson/permian_subbasins.geojson` | 5 features | Basin context candidate. |

Paths in this table are relative to `/Users/brian/`. Basin Atlas also contains an OGIM artifact with only four assets and explicitly documented fixture paths. Do not treat this as the full OGIM corpus. Its public-layer fixture, staged CV pond/fill/flow, and imagery-index fixtures are not production observations.

## Existing regulatory warehouse work

`/Users/brian/uplabs/produced-water-data-platform/README.md` and `catalog/source-inventory.md` describe implemented loaders for statewide UIC, governed Crane/Upton H-10 pressure history, Texas P-18, New Mexico C-115, and source-aware curated views. Raw folders currently contain RRC and NM captures. The documented totals below were not independently recounted in this inspection:

- July 2026 UIC snapshot: 126,651 permits; older than the new container snapshot.
- Governed H-10 AOI: 20,310 UIC-month rows, with frozen membership and response hashes.
- P-18: 45,825 approved filings, 53,413 well associations, 3,419,471 allocation rows.
- C-115: 2,001 district-month-disposition and 32,148 operator-month-disposition rows.

C-115 operator/district figures cannot become per-well injection points. P-18 reporting month and processing month must remain separate. Neither source proves physical pipeline connectivity, private contracts, or available disposal capacity.

## Recommended next additions

1. Import historical injection through the existing regulatory contracts; expose source date and coverage alongside the newer statewide well explorer.
2. Add historical USGS earthquakes and USGS produced-water chemistry as independent selectable layers.
3. Add Basin Atlas tanks, flares, electrical infrastructure and New Mexico disposal records, preserving observed versus model-detected labels.
4. Add P-18/C-115 movement views at their actual reporting grain; join to mapped assets only where identifiers support it.
5. Add company, pond and footprint overlays as an explicitly labeled analysis collection after provenance review.

For every import, retain source path, hash, acquisition/reporting date, record identifier, units, geometry, evidence class and transformation version. Raw datasets remain outside Git. Existing research/business documents are not automatically part of the map data intake.

## Other directory findings

`/Users/brian/upsoft/Basinatlas` and `/Users/brian/upsoft/Permiandash` are empty directories. The substantive atlas implementation is `/Users/brian/uplabs/basin-atlas`. `/Users/brian/upsoft/Exxon` currently contains a sparse `well data/app` directory; the usable offline package is under `uplabs/Exxon_Permian_Offline`. HeavenWatch already supplies the app’s ground-motion pilot.
