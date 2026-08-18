-- Migration v13: add r2_key column to repo_manifest table.
-- The files table already has r2_key in schema.sql.
-- Run with: wrangler d1 execute auditengine-d1 --file=src/db/migrations/v13_add_r2_key.sql

ALTER TABLE repo_manifest ADD COLUMN r2_key TEXT;
