CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS landman;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE TABLE IF NOT EXISTS landman.ingest_run (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, source text NOT NULL,
 state text NOT NULL DEFAULT 'loading', expected_count bigint, row_count bigint NOT NULL DEFAULT 0,
 started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS landman.dataset (name text PRIMARY KEY, run_id bigint REFERENCES landman.ingest_run(id));
CREATE TABLE IF NOT EXISTS landman.well_location (
 run_id bigint NOT NULL REFERENCES landman.ingest_run(id), objectid bigint NOT NULL,
 api8 text, well_number text, category text, symbol integer,
 geom geometry(Point,4326), raw jsonb NOT NULL,
 PRIMARY KEY(run_id,objectid)
);
CREATE INDEX IF NOT EXISTS well_location_geom ON landman.well_location USING gist(geom);
CREATE INDEX IF NOT EXISTS well_location_api ON landman.well_location(api8,run_id);
CREATE INDEX IF NOT EXISTS well_location_category ON landman.well_location(category,run_id);
CREATE TABLE IF NOT EXISTS landman.uic_permit (
 run_id bigint NOT NULL REFERENCES landman.ingest_run(id), uic text NOT NULL,
 api8 text, injection_type integer, geom geometry(Point,4326), raw jsonb NOT NULL,
 PRIMARY KEY(run_id,uic)
);
CREATE INDEX IF NOT EXISTS uic_permit_api ON landman.uic_permit(api8,run_id);
CREATE INDEX IF NOT EXISTS uic_permit_geom ON landman.uic_permit USING gist(geom);
CREATE TABLE IF NOT EXISTS landman.history_cache (
 api8 text PRIMARY KEY, fetched_at timestamptz NOT NULL DEFAULT now(), payload jsonb NOT NULL
);
GRANT CONNECT ON DATABASE landman TO godseye;
GRANT USAGE ON SCHEMA landman TO godseye;
GRANT SELECT ON ALL TABLES IN SCHEMA landman TO godseye;
GRANT INSERT,UPDATE ON landman.history_cache TO godseye;
