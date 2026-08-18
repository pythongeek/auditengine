-- Migration v11: add audit_logs table for settings/admin audit trail.
-- Run with: wrangler d1 execute auditengine-d1 --file=src/db/migrations/v11_audit_logs.sql

CREATE TABLE IF NOT EXISTS audit_logs (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  tenant_id     TEXT NOT NULL DEFAULT '',
  audit_run_id  TEXT NOT NULL DEFAULT '',
  agent_id      TEXT,
  event_type    TEXT NOT NULL,
  event_data    TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_run ON audit_logs(tenant_id, audit_run_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_run ON audit_logs(audit_run_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_type ON audit_logs(event_type);
