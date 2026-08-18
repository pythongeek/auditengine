-- Migration: add run_budget.throttled column and recreate the budget trigger for 80/95% pause enforcement.
-- Run once on existing deployments with:
--   wrangler d1 execute auditengine-d1 --file=src/db/migrations/v6_run_budget_throttle.sql

ALTER TABLE run_budget ADD COLUMN throttled INTEGER NOT NULL DEFAULT 0;

DROP TRIGGER IF EXISTS trg_token_usage_after_insert;

CREATE TRIGGER IF NOT EXISTS trg_token_usage_after_insert
AFTER INSERT ON token_usage
BEGIN
  UPDATE run_budget
  SET spent_usd  = spent_usd + NEW.cost_usd,
      updated_at = unixepoch()
  WHERE audit_run_id = NEW.audit_run_id;

  -- Throttle non-critical agents at 80% and pause everyone at 95%.
  UPDATE run_budget
  SET throttled = 1
  WHERE audit_run_id = NEW.audit_run_id
    AND throttled = 0
    AND spent_usd >= budget_usd * 0.80;

  UPDATE run_budget
  SET paused = 1
  WHERE audit_run_id = NEW.audit_run_id
    AND paused = 0
    AND spent_usd >= budget_usd * 0.95;

  -- Final guard: pause if over budget
  UPDATE run_budget
  SET paused = 1
  WHERE audit_run_id = NEW.audit_run_id
    AND spent_usd >= budget_usd
    AND paused = 0;

  -- Alert at 50%
  UPDATE run_budget
  SET alert_50_sent = 1
  WHERE audit_run_id = NEW.audit_run_id
    AND alert_50_sent = 0
    AND spent_usd >= budget_usd * 0.50;

  -- Alert at 80%
  UPDATE run_budget
  SET alert_80_sent = 1
  WHERE audit_run_id = NEW.audit_run_id
    AND alert_80_sent = 0
    AND spent_usd >= budget_usd * 0.80;

  -- Alert at 95%
  UPDATE run_budget
  SET alert_95_sent = 1
  WHERE audit_run_id = NEW.audit_run_id
    AND alert_95_sent = 0
    AND spent_usd >= budget_usd * 0.95;
END;
