-- Migration: add criticality flag to agent_config for 80/95% budget pause enforcement.
-- Run once on existing deployments with:
--   wrangler d1 execute auditengine-d1 --file=src/db/migrations/v5_add_agent_config_critical.sql

ALTER TABLE agent_config ADD COLUMN critical INTEGER NOT NULL DEFAULT 1;
