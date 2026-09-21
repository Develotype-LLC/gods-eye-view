-- Apply only after approval of the named users and private-data scope.
BEGIN;
INSERT INTO landman.owner_project(name,created_by)
 SELECT 'LONG-Haul · Brian and Dia','brian' WHERE NOT EXISTS(SELECT 1 FROM landman.owner_project WHERE name='LONG-Haul · Brian and Dia');
INSERT INTO landman.owner_project_member(project_id,actor)
 SELECT id,actor FROM landman.owner_project CROSS JOIN (VALUES ('brian'),('dia')) a(actor)
 WHERE name='LONG-Haul · Brian and Dia' ON CONFLICT DO NOTHING;
COMMIT;
