# Texas parcel intake

## Source and repeatability

Collection: TxGIO Land Parcels 2025, `0fa04328-872e-481c-b453-126a74777593`, published September 11, 2025. The catalog identifies the data license as CC0-1.0. County and account source dates vary; the collection year is not a uniform effective date.

- [TxGIO land parcels](https://geographic.texas.gov/stratmap/land-parcels)
- [Collection API](https://api.tnris.org/api/v1/collections?search=land%20parcels)
- [Official public S3 download listing](https://tnris-data-warehouse.s3.us-east-1.amazonaws.com/index.html?#LCD/collection/stratmap-2025-land-parcels)
- [TxGIO desktop bulk downloader](https://github.com/TNRIS/go-bulk-downloader): a Go/Fyne GUI using the resources API and a collection ID. It downloads archives; it does not provide parcel search or ownership interpretation. The application's importer uses the public S3 distribution published in the catalog, since the resource CDN returned HTTP 403 during intake.

`TEXAS-LAND-SOURCES.json` records the 46 source ZIP URLs, SHA-256 hashes, original and imported counts, geometry repairs, missing geometries and source dates. County selection intersects Census TIGER county boundaries with the app's USGS Permian and Palo Duro polygons. Imported county files remain complete; map queries require each parcel to intersect either basin with positive area.

From the repository root, using Python with GeoPandas, Shapely and NumPy:

```sh
python scripts/download-land-parcels.py
python scripts/export-land-parcels.py
GODSEYE_PROXMOX_HOST=root@192.168.5.50 python3 deploy/import-land.py
```

The exporter reads the existing Long Haul research entity registry at the path documented in the ownership plan. Project-specific client designations are removed. Source ZIPs and generated packets stay in ignored `.gev-cache/land-intake/`; they are not browser assets. The deployment script makes a PostgreSQL custom-format backup before importing. The importer requires psycopg2 on CT110 and uses UTF-8 explicitly with literal Unicode JSON for the existing SQL_ASCII database. Optional source Z coordinates are dropped because the parcel schema represents horizontal footprints. One transaction activates all county snapshots, with hash-based repeat detection and a transaction-level advisory lock. Staging-table statistics prevent poor join plans after a rolled-back import.

## Data interpretation

Identical normalized geometry within each county is stored once, retaining separate appraisal accounts and raw owner names. Whole-parcel geometric acres are counted once per geometry, regardless of how many account/class matches apply. This is not surveyed acreage, net mineral acreage, or clipped in-basin acreage. Cross-county overlaps are not dissolved.

Owner keys currently normalize appraisal names, retaining corporate suffixes. They are not verified legal-entity identifiers. Exact registry names and aliases attach research candidates; they do not confirm identity, affiliation or title. The first release does not expand a portfolio automatically through parent/subsidiary relationships or equivalent names. Users select each appraisal name explicitly. The 127-entity research registry provides limited candidate coverage; it is not an exhaustive classification of Texas owners. Data-center, power, agriculture and other classes can be assigned with an evidence note; blank classes do not establish absence of those uses.

Classification changes record the authenticated username, evidence note, time and prior/new classes in an append-only application audit log. Shared client portfolios save explicit selected names; adding to an existing portfolio does not remove members. No client is assumed from another project.

Recorded mineral, leasehold, easement, option and surface-interest records have their own table and filters. No recorded instruments are imported in this release. Unknown mineral ownership remains unknown. Nearby project-to-parcel relationships and company-family grouping remain follow-up work from the plan. Mailing and situs addresses are omitted from the exported accounts.

## UI

Landman → **Land & rights → Land ownership**. Choose basin and select by specific owner, client portfolio or owner class, then Apply filters. Regional views show counts; views with 600 or fewer matches show polygons. The list shows the first 50 of those polygons; all returned polygons are selectable on the map. Fit results uses the complete filtered extent. Parcel inspection shows account fields, county source links, source dates, candidate relationship evidence and classification controls.

## Verified inventory and checks

September 21, 2026: 769,348 county geometries and 798,303 linked appraisal accounts imported. Source files contain 798,450 rows; 147 lacked usable polygon geometry, and 96 geometries were repaired. Source acquisition dates range from January through August 2025. Basin filtering returns 410,088 Permian parcels and 96,988 Palo Duro parcels (507,076 combined).

Live API checks verified 46 county snapshots, owner search, polygon/detail responses, class candidate inclusion/exclusion, empty documented-mineral results and HTTP 401 without authentication. A Chevron name query returns six distinct appraisal spellings/names; these are intentionally not treated as one verified entity. `CHEVRON USA INC` returns 42 polygons across the combined basin scope. The midstream research-candidate filter returns 80 parcels; reviewed-only returns zero until users review owners.

64 targeted catalog, state and land tests pass. 29 socket/provider regression tests pass with localhost binding allowed. The broader suite exposed an existing icon-subset false positive (`us` and `permian` strings in the prior ground-motion library code); the sandbox also blocked socket tests, which passed on the permitted rerun. Build and import-boundary checks pass.

A real PostgreSQL integration check (`scripts/check-land-db.mjs`, run as the app database user) verified explicit client membership, authenticated actor attribution, classification audit insertion and unchanged parcel/acreage totals across owner, client and overlapping-role filters. All check writes were rolled back. Browser verification on the deployed hostname confirmed owner search and filtering.
