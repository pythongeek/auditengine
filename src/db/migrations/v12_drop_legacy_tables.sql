-- Migration v12: drop legacy empty tables whose schema drifted from schema.sql.
-- The tables are empty in production, so this is safe. schema.sql will recreate them with the current shape.

DROP TABLE IF EXISTS claims;
DROP TABLE IF EXISTS repo_manifest;
DROP TABLE IF EXISTS findings;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS agent_registry;
DROP TABLE IF EXISTS run_budget;
DROP TABLE IF EXISTS token_usage;
DROP TABLE IF EXISTS salvation_reports;
DROP TABLE IF EXISTS agent_errors;
