# Reference layers and source plan

Existing local sources and reuse priorities are inventoried in [LOCAL-PROJECT-REUSE.md](LOCAL-PROJECT-REUSE.md). This includes Basin Atlas infrastructure, the produced-water regulatory platform, science-data history, USGS chemistry, and the Exxon offline package.

Status: first ground-movement pilot implemented, 2026-09-20. This is the proposed source roadmap, not a claim that every dataset has been imported or its current access terms verified. The in-app Library uses src/reference/catalog.js.

Available = implemented map control; On disk = artifacts found in HeavenWatch, pending quality review and export; Planned = proposed source; Future = product availability to verify; Research only = unsuitable for operational display.

| Layer | Status | Source | Initial coverage | Next step |
|---|---|---|---|---|
| US geological basins | Available | USGS Sedimentary Basins of the U.S.A. | Contiguous US, Alaska, Hawaii and offshore basin areas | 144 source features; named-basin selection, classification and source scale. |
| Texas wells · statewide database | Available | [Texas RRC public GIS + statewide UIC permit master](https://www.rrc.texas.gov/resource-center/research/data-sets-available-for-download/) | Statewide Texas · all published GIS well-location classifications | Add other statewide datasets and preserve source-specific identifiers and reporting dates. |
| Ground movement · OPERA | Available | [NASA JPL OPERA DISP-S1 / ASF DAAC](https://www.jpl.nasa.gov/go/opera/products/disp-product-suite/) | Crane County / Tubbs Corner · 2016–2025 | Expand by region and acquisition window after validating each export. |
| Radar coherence and coverage | On disk | [OPERA DISP-S1 ancillary layers](https://www.jpl.nasa.gov/go/opera/products/disp-product-suite/) | HeavenWatch validation areas | Export time-aware quality summaries from the existing cube. |
| Surface water and new ponding | Planned | [NASA OPERA DSWx-HLS / DSWx-S1](https://www.jpl.nasa.gov/go/opera/products/) | Regional, subject to product coverage | Select dates, QA masks, and a minimum mapped area. |
| Vegetation disturbance | Planned | [OPERA DIST-HLS; Sentinel-2 / HLS](https://www.jpl.nasa.gov/go/opera/products/dist-product-suite/) | Permian pilot areas | Define comparison windows and coverage screening. |
| Radar backscatter and wetting | Planned | [OPERA RTC-S1 / ASF DAAC](https://www.jpl.nasa.gov/go/opera/products/) | Permian pilot areas | Pair with precipitation before deriving anomalies. |
| Surface temperature | Planned | [NASA ECOSTRESS; USGS Landsat Collection 2 L2](https://ecostress.jpl.nasa.gov/) | Scene-dependent | Inventory usable scenes and current product quality notes. |
| NISAR displacement | Future | [NASA–ISRO NISAR / OPERA DISP-NI](https://www.jpl.nasa.gov/go/opera/products/disp-product-suite/) | Availability to verify before intake | Check validated product coverage and compatibility when available. |
| Disposal and injection wells | Available | [Texas RRC; NM OCD for expansion](https://www.rrc.texas.gov/resource-center/research/data-sets-available-for-download/) | Crane County pilot · Texas RRC API | Expand the geographic query after reviewing missing-location coverage. |
| Reported injection history | Available | [Texas RRC H-10 / injection reporting](https://www.rrc.texas.gov/oil-and-gas/publications-and-notices/online-research-queries/) | Crane County pilot · latest published H-10 records | Review source revisions and expand coverage; cache refreshes on demand every 6 hours. |
| Wellbores, inactive and orphan wells | On disk | [Texas RRC Full Wellbore, IWAR and orphan-well records](https://www.rrc.texas.gov/resource-center/research/data-sets-available-for-download/) | Texas; imported subsets need audit | Reconcile effective dates and coordinate completeness. |
| Drilling permits and activity | On disk | [Texas RRC W-1; NM OCD permits](https://www.rrc.texas.gov/resource-center/research/data-sets-available-for-download/) | Texas / New Mexico | Export HeavenWatch W-1 subset and retain amendment dates. |
| Oil, gas and produced-water history | Planned | [NM OCD C-115; Texas RRC production and well tests](https://www.emnrd.nm.gov/ocd/) | Source-dependent well / lease / operator grain | Define grain and crosswalks before mapping totals. |
| Recycling and treatment facilities | Planned | [NM OCD facility permits; Texas RRC permits; Reference Library](https://www.emnrd.nm.gov/ocd/) | Permian | Review the facility evidence register and precise locations. |
| Water and energy pipelines | Planned | [Texas RRC GIS; source-backed Longhaul records; authorized operator maps](https://gis.rrc.texas.gov/gisviewer/) | Source-dependent | Audit public source rights and retain private geometry separately. |
| Power, substations and data centers | Planned | [EIA-860; HIFLD where available; OSM; project permits](https://www.eia.gov/electricity/data/eia860/) | Regional | Separate operating assets from announced and permitted projects. |
| Earthquakes and seismic response areas | On disk | [TexNet catalog; USGS; Texas RRC SRA boundaries](https://www.beg.utexas.edu/texnet-cisr/texnet) | Permian and regional context | Audit catalog date/magnitude completeness and source-specific restrictions. |
| Faults and stratigraphy | On disk | [UT BEG / CISR published geology and pressure datasets](https://www.beg.utexas.edu/texnet-cisr) | Published grid / study extents | Verify licenses, CRS, depth datum, and missing-value conventions. |
| Reported blowouts and surface incidents | On disk | [Texas RRC incident tables; source-linked HeavenWatch event register](https://www.rrc.texas.gov/) | Dated public records | Review event classes, locations, and source locators. |
| Modeled pressure and attribution | Research only | [HeavenWatch model outputs; public injection and geology inputs](https://www.beg.utexas.edu/texnet-cisr) | Experimental study areas | Keep out of operational layers until scientific gates are met. |
| Aquifers and groundwater levels | Planned | [TWDB aquifer / groundwater datasets; USGS NWIS](https://www.twdb.texas.gov/groundwater/) | Texas and regional stations | Select aquifers, datums, date windows, and observation quality flags. |
| Precipitation and drought | Planned | [PRISM; NOAA MRMS; US Drought Monitor](https://prism.oregonstate.edu/) | Regional gridded / weekly products | Verify reuse terms and align observation windows. |
| Terrain, floodplains and wetlands | Planned | [USGS 3DEP; FEMA NFHL; USFWS NWI; TxGIO](https://www.usgs.gov/3d-elevation-program) | Coverage varies by source and survey date | Record resolution, vertical datum, vintage, and coverage gaps. |
| Parcels, rights and corridor constraints | Planned | [County appraisal / recorded instruments; BLM; authorized project records](https://www.blm.gov/services/geospatial/GISData) | County and project-specific | Use separate private access for legal and client records. |

## Recommended implementation order

1. Ground movement: current Crane County pilot; inspect pixels and compare full/short-wavelength variants.
2. Add quality/coherence and valid-observation coverage alongside the same raster.
3. Import disposal/injection wells and reported monthly injection with audited identifiers and dates.
4. Add well status, seismicity, incidents and mapped geology for context.
5. Add water facilities, pipelines and production histories after source/grain review.
6. Add surface water, vegetation, wetting and thermal products, then terrain and siting constraints.

Every intake should include source URL, acquisition/reporting period, retrieval time, geometry/CRS, units, missing-value semantics, transformations, evidence class, license/access constraints and source hashes. Announcements, permits, observations, estimates and research outputs should remain distinct.

## NASA connection

The app calls GET /api/reference/ground-motion/availability. The server queries the public [NASA CMR API](https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html) with collection OPERA_L3_DISP-S1_V1 and frame F20697, returning the latest acquisition separately from reference and processing dates. Checks are coalesced and cached for 15 minutes; failures return an explicit error rather than an old success. The API is behind the site's existing authentication. No NASA key is needed for metadata discovery.

A live check on 2026-09-20 returned 269 granules, latest acquisition 2025-12-30. Collection discovery returned DISP-S1 V1 and its static companion; this is a frame-specific catalog result, not a statement about all NASA imagery. The [OPERA displacement suite](https://www.jpl.nasa.gov/go/opera/products/disp-product-suite/) describes line-of-sight displacement.

Protected NetCDF product downloads use an Earthdata account/token through ASF. HeavenWatch has an EARTHDATA_TOKEN setting, but this integration has not tested its validity. Keep that token on the processing host. A browser API key is neither needed nor appropriate.

Automated downloads and recomputation are not enabled in this pilot. Next, reuse HeavenWatch discovery/download/stitch/feature steps in a bounded region/date job, validate outputs, then publish an atomic versioned snapshot. CMR discovery alone does not turn NetCDF into map tiles. A changed processing date can also require reprocessing even when the latest acquisition date is unchanged.

## Ground-movement export and interpretation

Read-only source: /Users/brian/upsoft/heavenwatch/data/validation_b. The exporter uses existing features_displacement.zarr and features_short_wavelength_displacement.zarr, checks the frame/date inventory against disp_cube.zarr, and exports WGS84 PNG overlays plus little-endian float32 pixel values. Source CRS is EPSG:32613; nearest-neighbor reprojection preserves missing pixels. Source inventory and feature tree hashes are retained in manifest.json. The source working tree was dirty; the export does not pretend that a Git commit fully captures those artifacts.

The display is historical fitted LOS velocity, not vertical uplift. Positive is toward the satellite; negative is away. Full-period dates are 2016-08-01 through 2025-12-30, with 269 acquisitions and native 30 m posting. The fit, epoch stitching and causal interpretation have not been independently revalidated. Colors saturate at ±30 mm/year, while pixel sampling retains unclipped values. Transparent cells mean no valid value, not zero.

HeavenWatch's docs/REVIEW_2026-07-09.md records unresolved validation issues, including Toyah detection failure and a badly underestimated physical model. Risk scores, injection attribution and safe-capacity claims are therefore excluded.

To reproduce locally:

```sh
/Users/brian/upsoft/heavenwatch/.venv/bin/python scripts/export-heavenwatch.py --source /Users/brian/upsoft/heavenwatch
npm run build
```

Generated data lives in ignored public/reference-data/heavenwatch, is copied into dist by the build, and is served behind the app's authentication. It is not checked into the public fork. A fresh checkout needs the export before this layer can load.

## UI

Open DATA LAYERS → LIBRARY. Search the source roadmap, inspect a layer, and use View ground movement on map. This switches from Google photoreal meshes to satellite terrain so the imagery overlay is visible. The map legend provides variant, opacity, signed units and click-to-sample controls. The Library's Check NASA button reports available acquisitions separately from the displayed period.

## Disposal wells and injection pilot — 2026-09-20

Added 160 disposal wells and 5,685 archived monthly records for 72 wells, January 2016 through July 2025, from HeavenWatch validation_b/rrc. This is a historical local subset; source retrieval time is unavailable in the artifacts. API-14-like keys are synthetic and are labeled as such. UIC identifiers are retained. Duplicate well/month and orphan-join checks passed; volume values were finite and nonnegative. There are 90 shallow, 69 deep, and one unclassified well in the existing interpretation.

The exporter retains source hashes and flags: disposal types 1/2, no waterflood type 3, pressure-zero ambiguity, clipped trailing zero months, possible upstream blank-to-zero conversion, and approximate NAD83/WGS84 location handling. No recent-operation, causal, or capacity inference is made. An archived zero is labeled separately from a month with no record.

Run `/Users/brian/upsoft/heavenwatch/.venv/bin/python scripts/export-injection.py --source /Users/brian/upsoft/heavenwatch` before building a fresh checkout. Output is ignored `public/reference-data/heavenwatch/injection.json`, served behind the existing login. The Library's disposal-well and injection-history entries open the same linked layer. The panel offers month selection, a well selector, click-to-inspect markers, and monthly volume/pressure tables. Monthly totals identify the reporting subset and are not regional production totals.

## Direct Texas RRC connection — 2026-09-20

The well/history layer now reads `/api/reference/rrc/injection`. The server queries the official Texas Open Data Portal well master (`givw-z9t4`) and H-10 dataset (`qq2j-f2zm`) for the fixed pilot bounds [-102.85,31.3,-102.45,31.6], joins by UIC, and aggregates disposal types 1/2 to API-8-based well identities. Anonymous requests work; no NASA or RRC key is required for this connection.

A direct verification returned 174 permits, 13 excluded placeholder/invalid records, 160 mapped wells, and 5,805 usable monthly records extending through June 2026. The fetch included 7,771 raw monthly rows; 1,762 trailing zero well-months were removed to avoid interpreting source placeholders as shutoff. Null volume rows are counted and omitted, never coerced to zero. Missing pressure and zero-pressure ambiguity are retained. Fresh API records do not inherit the older HeavenWatch shallow/deep interpretation.

Refresh is request-driven: a six-hour server cache avoids repeated bulk queries, concurrent requests coalesce, pagination and response sizes are capped, and refresh has a 50-second deadline. This is not a scheduled monitoring job. The browser holds the loaded snapshot until the app reloads. Its source detail and well panel show the retrieval timestamp separately from reporting period. H-10 values remain delayed annual filings of monthly measurements.

Production cache is `/var/lib/godseye/rrc-injection.json` (`StateDirectory=godseye`), replaced atomically after a successful validated fetch and retained across releases. If RRC fails, the endpoint explicitly labels the previous cache stale; without a cache, it explicitly labels the bundled HeavenWatch archive as fallback. A failed refresh is backed off for five minutes. Local development defaults to `.gev-cache/rrc-injection.json`.


## Statewide database

The dedicated PostgreSQL/PostGIS database and Texas wells layer extend beyond the Crane County pilot to the complete RRC GIS location and UIC permit inventories. The database serves viewport clusters, source-classification filters and API search. Per-well disposal history is fetched and saved on demand. See [database runbook](../../deploy/database/README.md) for source coverage, import reconciliation, access controls and refresh procedures.

## National basin overlay

USGS source: https://energy.usgs.gov/arcgis/rest/services/BaseMaps/Sedimentary_Basin/MapServer/0

Refresh with `python3 scripts/export-us-basins.py` before building. The ignored `public/reference-data/basins/` files are copied into the deployment build, with retrieval time and SHA-256 in `manifest.json`. The query requests WGS84 coordinates, four decimal places and 0.02-degree display generalization, reconciling the source feature count. The September 2026 capture contains 144 features, rendered as 207 polygon parts and 209 rings. Multipart basins share one selector entry. This is a retrieved historical interpretation, not a claim of a September 2026 geological revision. Source scale, era and basin type remain visible. Boundaries are regional screening context, not leases, formation-level boundaries or hydrocarbon presence. No API key is required.
