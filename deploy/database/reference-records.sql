CREATE TABLE IF NOT EXISTS landman.reference_run (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 imported_at timestamptz NOT NULL DEFAULT now(), manifest jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS landman.reference_dataset (
 id text PRIMARY KEY, run_id bigint NOT NULL REFERENCES landman.reference_run(id),
 name text NOT NULL, source text NOT NULL, note text NOT NULL,
 feature_count bigint NOT NULL DEFAULT 0, located_count bigint NOT NULL DEFAULT 0,
 observation_count bigint NOT NULL DEFAULT 0, metadata jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS landman.reference_feature (
 run_id bigint NOT NULL REFERENCES landman.reference_run(id), dataset text NOT NULL,
 key text NOT NULL, name text NOT NULL, api8 text, observed_date date,
 geom geometry(Geometry,4326), properties jsonb NOT NULL,
 PRIMARY KEY(run_id,dataset,key)
);
CREATE INDEX IF NOT EXISTS reference_feature_geom ON landman.reference_feature USING gist(geom);
CREATE INDEX IF NOT EXISTS reference_feature_api ON landman.reference_feature(api8,run_id);
CREATE INDEX IF NOT EXISTS reference_feature_date ON landman.reference_feature(dataset,run_id,observed_date);
CREATE TABLE IF NOT EXISTS landman.reference_observation (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 run_id bigint NOT NULL REFERENCES landman.reference_run(id), dataset text NOT NULL,
 feature_key text NOT NULL, period text NOT NULL, kind text NOT NULL, value double precision,
 raw jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS reference_observation_lookup ON landman.reference_observation(run_id,dataset,feature_key,period,kind);
CREATE TABLE IF NOT EXISTS landman.rrc_record (
 run_id bigint NOT NULL REFERENCES landman.reference_run(id), kind text NOT NULL,
 record_id bigint NOT NULL, api8 text, join_key text, raw jsonb NOT NULL,
 PRIMARY KEY(run_id,kind,record_id)
);
CREATE INDEX IF NOT EXISTS rrc_record_api ON landman.rrc_record(run_id,api8,kind);
CREATE INDEX IF NOT EXISTS rrc_record_join ON landman.rrc_record(run_id,kind,join_key);
GRANT SELECT ON landman.reference_run,landman.reference_dataset,landman.reference_feature,landman.reference_observation,landman.rrc_record TO godseye;
