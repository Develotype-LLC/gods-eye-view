# LANDMAN'S Eye spatial database

Dedicated PostgreSQL 16/PostGIS database `landman` lives in CT110 on the same host as the app. PostgreSQL listens only on its Unix socket, not a TCP port. The `godseye` application role uses peer authentication and has SELECT access to the inventory tables plus INSERT/UPDATE on the per-well history cache. It cannot create databases, administer PostgreSQL, or alter the source inventories.

## Data and publication

- `landman.well_location`: all records in the official RRC GIS Well Locations service, including raw attributes, transformed EPSG:4326 geometry, API-8 when valid, source classification and source object ID. Counts represent GIS locations, not unique active wells. Invalid/unassigned API identifiers remain in raw provenance rather than being padded into plausible IDs.
- `landman.uic_permit`: the complete Texas Open Data Portal UIC master, including all reported types and permits with missing coordinates. UIC coordinates are transformed from NAD83 EPSG:4269 to EPSG:4326.
- `landman.ingest_run` / `landman.dataset`: versioned import status, source URL, expected/actual row counts and atomic pointers to complete snapshots. An interrupted import is not activated.
- `landman.history_cache`: raw, per-UIC monthly H-10 records since 2016 retrieved on demand for a selected well's disposal-type permits. This is not a full statewide historical H-10 mirror. Oil/gas production history is a separate dataset and is not fabricated from injection records.

GIS import first captures the exact source object-ID list, then reconciles each 1,000-ID batch. Requests use four bounded workers. Duplicate/missing batch IDs cause failure. UIC import pages by stable UIC number, retaining unlocated permits, and compares the final row count to the source count before activation. Source services do not provide a transactionally pinned statewide snapshot; a changing source can fail reconciliation and require a fresh run. Existing versions remain recoverable.

The API answers viewport queries from PostGIS: individual points up to 1,500 records, otherwise a bounded grid of clusters with actual counts. API searches are parameterized, and history downloads have response/time/row/concurrency limits. Historic statuses, source zeros, null coordinates and unassigned identifiers remain explicit.

## Provisioning and refresh

Install `postgresql-16 postgresql-16-postgis-3 python3-psycopg2 python3-requests` inside CT110. Create a non-login owner `landman_owner`, database `landman`, and non-superuser login `godseye`; apply `schema.sql` as postgres. Set PostgreSQL `listen_addresses=''` and `shared_buffers='256MB'`. The app's Unix user `godseye` then connects without a password.

The deployed importer is `/var/lib/godseye/imports/import-texas.py`, from `scripts/import-texas.py`. Run as postgres:

```sh
python3 /var/lib/godseye/imports/import-texas.py uic
python3 /var/lib/godseye/imports/import-texas.py gis
```

To resume an interrupted GIS run, pass `--resume <run_id>`; the source count must still match and already-loaded ID batches are skipped. Reconcile the source ID hash before reusing a run after a source refresh. A global advisory lock prevents overlapping import jobs. Refresh is an explicit operator action; no recurring job is installed by this change.

Initial imports ran as systemd transient units `landman-uic-import` and `landman-gis-import`; inspect their journal for progress. Permanent database storage is the container's PostgreSQL data directory, independent of app releases. Refreshing the app does not reimport statewide datasets.

## Backup and checks

A PostgreSQL custom-format dump is stored under `/var/lib/postgresql/landman-backups/` after initial verification. This is a recovery copy on the same container, not an off-host disaster-recovery backup. Do not overwrite an existing backup. A future recurring backup should target separate storage with retention.

Useful verification queries:

```sql
SELECT d.name, r.row_count, r.completed_at, r.metadata
FROM landman.dataset d JOIN landman.ingest_run r ON r.id=d.run_id;
SELECT pg_size_pretty(pg_database_size('landman'));
```

The database preserves older import versions; review disk growth before retaining repeated statewide snapshots indefinitely. No source data, database dumps, credentials or raw records are committed to GitHub.

## Initial verified snapshot

On 2026-09-21 UTC, the import reconciled 1,396,962 GIS location records (all with geometry; 1,017,112 distinct valid API-8 values) and 126,745 UIC records (119,823 with geometry; 117,190 distinct valid API-8 values). The database occupied about 812 MB. The initial custom-format recovery dump was about 80 MB and its archive table of contents was verified. The app role could read inventories and write history cache entries, but could not insert inventory records; TCP listening was disabled.

Live checks covered statewide cluster counts, 140 records in a small East Texas test rectangle outside the original pilot, API-8 lookup, UIC joins and 114 H-10 rows for a sampled well, with the second history request served from the database cache. A valid API may have multiple GIS locations; the interface reports matching records rather than claiming a unique surveyed well position.

## Additional source collections

The RRC archive and TexNet, flare, pond, water and ET collections use `reference-records.sql`. See [the intake runbook](../../docs/reference/IMPORTED-COLLECTIONS.md) for exact coverage, refresh commands, backup location and verification.
