# RRC, TexNet, water and ET collections

Imported to LANDMAN’S Eye container 110 on 2026-09-21 UTC. All are snapshots; no automatic refresh schedule was created. Original local projects were read without modification. Raw packets and database records are outside Git and behind the app's existing authentication.

## Verified coverage

| Collection | Source features | Located | Linked history rows |
|---|---:|---:|---:|
| RRC inactive well projection | 117,169 | 115,946 | 117,169 |
| RRC plugging-history API groups | 87,137 | 86,820 | 87,159 actions |
| TexNet reviewed earthquakes | 50,832 | 50,832 | Source event properties |
| TexNet injection reporting | 1,077 | 1,077 | 3,759 annual summaries |
| VIIRS annual flares | 1,850 | 1,850 | Source detection properties |
| Produced-water pond candidates | 52 | 52 | Source candidate properties |
| Storage tank detections | 8,892 | 8,892 | Source detection properties |
| NM water infrastructure | 563 | 563 | Source facility properties |
| NM disposal wells | 5,114 | 5,114 | Source regulatory properties |
| EIA cooling-water facilities | 106 | 106 | 1,742 |
| OpenET fields | 42 | 42 | 1,008 |

The RRC record browser holds **1,166,980 source rows** across the existing SQLite archive's 19 tables, including 312,331 W-10 tests, 171,338 G-10 tests, 25,194 operator/county/year production rows, inactive records, plugging actions and provenance registers. Map groups and linked rows are projections of these records, not additional independent well populations.

## Source and interpretation boundaries

- **RRC:** `/Users/brian/uplabs/xon/recursivewater/datapack/rrc_texas.sqlite`. Inactive snapshot 2026-08-10; plugging physical years 2015–2026, with the current year partial. Map locations join API-8 to the existing statewide GIS snapshot; first GIS location is used when several match and the multiplicity is retained. Unlocated records remain searchable. W-10/G-10 tests use their source lease/gas-well identifiers; no invented API joins. Daily test rates are not annual produced-water volumes. Operator/county/year production is not per-well production.
- **TexNet seismic:** fresh public reviewed-layer capture from `https://maps.texnet.beg.utexas.edu/arcgis/rest/services/catalog/catalog_all/MapServer/0`. Preliminary layer excluded. Paged object-ID membership reconciles exactly. Event dates are UTC; original magnitude, depth and uncertainty fields are retained. Spatial coincidence with injection is not causation.
- **TexNet injection:** existing July 2026 `Reference Library/outputs/rrc-texnet-out-of-basin-investigation-2026-07-23/data/texnet/` CSVs. Retains 1,077 source well IDs and 3,759 annual aggregate rows. Operator reporting is a subset, not a statewide denominator or proof of continuous reporting/routing. Source: `https://maps.texnet.beg.utexas.edu/arcgis/rest/services/injection/injection/MapServer`.
- **Flares:** Basin Atlas's 2024 VIIRS Nightfire annual KML projection. Not live flaring. Generic detected-operator attribution and uncalibrated generic confidence are not promoted as facts. Original annual detection properties remain available.
- **Ponds:** Exxon offline GeoJSON; 52 point candidates, not pond outlines. Texas attribution is proximity-based; water-in-place/volume fields are modeled using assumed depth. Source and attribution tier are retained; ownership and capacity are not verified.
- **Tanks:** Basin Atlas AST published imagery detections. Polygons and source imagery dates retained. Contents and ownership are unknown; diameter-derived capacity is an estimate. This is general storage infrastructure, not a verified water-tank inventory.
- **NM infrastructure:** fresh official `OCDView/Facilities_Public/FeatureServer/0` capture restricted to Recycling Facility, Treating Plant, Injection Plant, Brine Well Facility and Pipeline - Water. Pipeline records are points, not routes. Regulatory status is retained; operational throughput and availability are not inferred.
- **NM disposal:** Basin Atlas June 2026 OCD snapshot including plugged/inactive classifications, not just operating wells.
- **Cooling water:** read-only export from the existing `supabase_db_ag-gis` local database. 2018 EIA records; withdrawal and consumption remain separate, measured in million gallons. Facilities are demand context, not committed produced-water customers.
- **ET:** the same local ag-gis database contains 42 fields near Lubbock, bounded approximately -101.959 to -101.858 longitude and 33.543 to 33.621 latitude. Exactly 504 monthly 2018 Ensemble actual-ET rows and 504 gridMET reference-ETo rows, in mm/month. A successful OpenET v2.1 ingestion run was verified. This is neither statewide coverage nor a current-year ET surface. Fields can be colored by month and variable; missing values are not treated as zero. The basemap may be newer than the field/crop data.

## App workflow

Open **Library**, search a collection, and choose **Open collection**. The shared explorer provides:

- Independent visibility checkboxes and a color key for active collections.
- Collection selection, zoom to coverage, and dated-period selection where available.
- ET versus ETo selection and field polygons.
- Count-preserving viewport clusters above 1,000 visible features; zoom reveals individual records.
- Click-through properties and paginated linked history.
- RRC archive search by API-8 or the exact source lease/gas-well/operator key. Leading zeros matter.
- A link from the existing Texas well details into its downloaded RRC records.

## Reproduction and operations

1. `python3 scripts/export-reference-records.py` reads the fixed local public-data projects and the running ag-gis database, captures public TexNet/NM catalogs, and writes `.gev-cache/reference-intake/`. Each collection includes file hashes, source paths, notes and raw property/history records. The live catalogs reconcile requested object IDs; no API key is used.
2. `GODSEYE_PROXMOX_HOST=root@192.168.5.50 python3 deploy/import-reference-records.py` transfers the packet and RRC SQLite file to a dated private directory on CT110, creates a pre-import backup, applies `deploy/database/reference-records.sql`, and runs `scripts/import-reference-records.py` as postgres.
3. The loader uses one transaction and an advisory lock. It activates the new dataset pointers only after loading and count/geometry reconciliation; failures roll back. Existing versions are retained. Connections use UTF-8 with literal UTF-8 JSON because the existing database was created with SQL_ASCII encoding.
4. Build with Node 24, deploy using `deploy/deploy.py`, and run `node deploy/verify-records.mjs`. The verification covers authenticated access, all collection counts, cluster conservation, ET/ETo values, raw record search, browser field picking, layer selection and hide cleanup.

Database `landman` was approximately 1.9 GB after intake. It remains Unix-socket-only and the app receives SELECT access to the new tables. The active packet is `/var/lib/godseye/imports/reference-20260921T022422Z/`; the active reference run is 3 (two failed encoding attempts rolled back).

Post-import recovery copy: `/var/lib/postgresql/landman-backups/reference-layers-20260921.dump`. It is on the same container and is not an off-host disaster-recovery backup. Full historical H-10, P-18 allocations, broader ET coverage, and mapped water-pipeline routes remain separate future intake work; this change does not claim those are loaded.
