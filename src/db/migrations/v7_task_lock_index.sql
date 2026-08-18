-- Migration: add composite index for coordinator task lock timeout queries.
-- Run once on existing deployments with:
--   wrangler d1 execute auditengine-d1 --file=src/db/migrations/v7_task_lock_index.sql

CREATE INDEX IF NOT EXISTS idx_tasks_run_status_lock ON tasks(audit_run_id, status, lock_expires_at);
