BEGIN;
CREATE TABLE IF NOT EXISTS landman.owner_project (
 id bigserial PRIMARY KEY, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120), created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS landman.owner_project_member (
 project_id bigint REFERENCES landman.owner_project(id), actor text NOT NULL, PRIMARY KEY(project_id,actor)
);
-- A profile identifies a source name group or a particular unresolved parcel, not verified title.
-- Stable IDs and append-only revisions keep private work separate from refreshed source data.
CREATE TABLE IF NOT EXISTS landman.owner_profile (
 id bigserial PRIMARY KEY, project_id bigint NOT NULL REFERENCES landman.owner_project(id),
 subject text NOT NULL, name text NOT NULL, revision integer NOT NULL DEFAULT 1,
 data jsonb NOT NULL, updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,subject)
);
CREATE TABLE IF NOT EXISTS landman.owner_profile_history (
 id bigserial PRIMARY KEY, profile_id bigint NOT NULL REFERENCES landman.owner_profile(id),
 revision integer NOT NULL, data jsonb NOT NULL, actor text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(profile_id,revision)
);
GRANT SELECT,INSERT ON landman.owner_project,landman.owner_project_member TO godseye;
GRANT SELECT,INSERT,UPDATE ON landman.owner_profile TO godseye;
GRANT SELECT,INSERT ON landman.owner_profile_history TO godseye;
GRANT USAGE,SELECT ON SEQUENCE landman.owner_project_id_seq,landman.owner_profile_id_seq,landman.owner_profile_history_id_seq TO godseye;
CREATE INDEX IF NOT EXISTS owner_project_member_actor ON landman.owner_project_member(actor,project_id);
CREATE INDEX IF NOT EXISTS owner_profile_recent ON landman.owner_profile(project_id,updated_at DESC);
COMMIT;
