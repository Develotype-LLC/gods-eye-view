BEGIN;
CREATE TABLE IF NOT EXISTS landman.land_snapshot (
 id text PRIMARY KEY, fips text NOT NULL, metadata jsonb NOT NULL, imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS landman.land_county (
 fips text PRIMARY KEY, name text NOT NULL, snapshot_id text REFERENCES landman.land_snapshot(id), geom geometry(MultiPolygon,4326) NOT NULL
);
CREATE TABLE IF NOT EXISTS landman.land_basin (id text PRIMARY KEY, geom geometry(MultiPolygon,4326) NOT NULL);
CREATE TABLE IF NOT EXISTS landman.land_owner (
 owner_key text PRIMARY KEY, name text NOT NULL, candidate_roles text[] NOT NULL DEFAULT '{}', candidates jsonb NOT NULL DEFAULT '[]',
 reviewed_roles text[] NOT NULL DEFAULT '{}', review_note text, reviewed_by text, reviewed_at timestamptz
);
CREATE TABLE IF NOT EXISTS landman.land_parcel (
 id bigserial PRIMARY KEY, snapshot_id text NOT NULL REFERENCES landman.land_snapshot(id), source_key text NOT NULL,
 geom geometry(MultiPolygon,4326) NOT NULL, basins text[] NOT NULL, area_acres double precision NOT NULL,
 UNIQUE(snapshot_id,source_key)
);
CREATE INDEX IF NOT EXISTS land_parcel_geom ON landman.land_parcel USING gist(geom);
CREATE INDEX IF NOT EXISTS land_parcel_basins ON landman.land_parcel USING gin(basins);
CREATE INDEX IF NOT EXISTS land_parcel_snapshot ON landman.land_parcel(snapshot_id);
CREATE TABLE IF NOT EXISTS landman.land_account (
 parcel_id bigint NOT NULL REFERENCES landman.land_parcel(id), source_key text NOT NULL, owner_key text NOT NULL REFERENCES landman.land_owner(owner_key),
 raw_owner text NOT NULL, properties jsonb NOT NULL, PRIMARY KEY(parcel_id,source_key)
);
CREATE INDEX IF NOT EXISTS land_account_owner ON landman.land_account(owner_key,parcel_id);
CREATE TABLE IF NOT EXISTS landman.land_client (
 id bigserial PRIMARY KEY, name text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), created_by text NOT NULL
);
CREATE TABLE IF NOT EXISTS landman.land_client_owner (
 client_id bigint NOT NULL REFERENCES landman.land_client(id), owner_key text NOT NULL REFERENCES landman.land_owner(owner_key), PRIMARY KEY(client_id,owner_key)
);
CREATE TABLE IF NOT EXISTS landman.land_interest (
 id bigserial PRIMARY KEY, parcel_id bigint REFERENCES landman.land_parcel(id), kind text NOT NULL CHECK(kind IN ('surface','mineral','leasehold','easement','option')),
 party text NOT NULL, instrument text NOT NULL, source_url text, recorded_date date, evidence_status text NOT NULL, fraction numeric, depth_scope text, legal_tract text
);
GRANT SELECT ON landman.land_snapshot,landman.land_county,landman.land_basin,landman.land_owner,landman.land_parcel,landman.land_account,landman.land_client,landman.land_client_owner,landman.land_interest TO godseye;
GRANT INSERT ON landman.land_client,landman.land_client_owner TO godseye;
GRANT UPDATE(reviewed_roles,review_note,reviewed_by,reviewed_at) ON landman.land_owner TO godseye;
GRANT USAGE,SELECT ON SEQUENCE landman.land_client_id_seq TO godseye;
CREATE TABLE IF NOT EXISTS landman.land_owner_review_log (
 id bigserial PRIMARY KEY, owner_key text NOT NULL, previous_roles text[], roles text[], note text, actor text, changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION landman.log_land_owner_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,landman AS $$
BEGIN
 INSERT INTO landman.land_owner_review_log(owner_key,previous_roles,roles,note,actor) VALUES(NEW.owner_key,OLD.reviewed_roles,NEW.reviewed_roles,NEW.review_note,NEW.reviewed_by);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS land_owner_review ON landman.land_owner;
CREATE TRIGGER land_owner_review AFTER UPDATE OF reviewed_roles ON landman.land_owner FOR EACH ROW EXECUTE FUNCTION landman.log_land_owner_review();
GRANT SELECT ON landman.land_owner_review_log TO godseye;
COMMIT;
