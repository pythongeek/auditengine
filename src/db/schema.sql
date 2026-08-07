-- AuditEngine D1 Schema v1.0
-- Run with: wrangler d1 execute auditengine-d1 --file=src/db/schema.sql

-- PRAGMA journal_mode=WAL; temporarily disabled for local execution

-- File ownership claims (atomic — UNIQUE prevents duplicate analysis)
CREATE TABLE IF NOT EXISTS claims (
  claim_id     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  audit_run_id TEXT NOT NULL,
  agent_id     TEXT NOT NULL,
  file_path    TEXT NOT NULL,
  claimed_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(audit_run_id, file_path)
);

-- Repo file manifest (written by ingestion worker)
CREATE TABLE IF NOT EXISTS repo_manifest (
  manifest_id  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  audit_run_id TEXT NOT NULL,
  file_path    TEXT NOT NULL,
  domain       TEXT NOT NULL,
  chunk_count  INTEGER NOT NULL DEFAULT 1,
  byte_size    INTEGER NOT NULL DEFAULT 0,
  indexed_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_manifest_run_domain ON repo_manifest(audit_run_id, domain);

-- Findings (written by agents, read by priority resolver + verification)
CREATE TABLE IF NOT EXISTS findings (
  finding_id       TEXT PRIMARY KEY,
  audit_run_id     TEXT NOT NULL,
  agent_id         TEXT NOT NULL,
  agent_type       TEXT NOT NULL,
  severity         TEXT NOT NULL CHECK(severity IN ('critical','high','medium','low','info')),
  category         TEXT NOT NULL,
  file             TEXT NOT NULL,
  line_range_start INTEGER,
  line_range_end   INTEGER,
  evidence_quote   TEXT NOT NULL,
  description      TEXT NOT NULL,
  impact           TEXT,
  verified_by      TEXT NOT NULL,  -- JSON array
  source           TEXT NOT NULL DEFAULT 'agent',
  status           TEXT NOT NULL DEFAULT 'open',
  recurrence_count INTEGER NOT NULL DEFAULT 0,
  ts               INTEGER NOT NULL DEFAULT (unixepoch()),
  verified_at      INTEGER,
  screenshot_id    TEXT
);
CREATE INDEX IF NOT EXISTS idx_findings_run     ON findings(audit_run_id);
CREATE INDEX IF NOT EXISTS idx_findings_file    ON findings(audit_run_id, file);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(audit_run_id, severity);

-- Prioritized tasks (written by Priority Resolver Workflow)
CREATE TABLE IF NOT EXISTS tasks (
  task_id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  audit_run_id     TEXT NOT NULL,
  title            TEXT NOT NULL,
  finding_ids      TEXT NOT NULL,  -- JSON array
  priority_score   REAL NOT NULL DEFAULT 0,
  multipliers      TEXT NOT NULL DEFAULT '[]',  -- JSON array
  status           TEXT NOT NULL DEFAULT 'backlog',
  assigned_agent   TEXT,
  commit_sha       TEXT,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  conflict_flag    INTEGER NOT NULL DEFAULT 0,
  conflict_reason  TEXT,
  lock_expires_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tasks_run_status ON tasks(audit_run_id, status);

-- Agent registry (written by coordinator, read by coordinator + dashboard)
CREATE TABLE IF NOT EXISTS agent_registry (
  agent_id    TEXT PRIMARY KEY,
  agent_type  TEXT NOT NULL,
  audit_run_id TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'boot',
  phase       INTEGER NOT NULL DEFAULT 1,
  spawned_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  done_at     INTEGER,
  queue_cursor INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_registry_run ON agent_registry(audit_run_id, status);

-- Budget + run state (one row per audit run)
CREATE TABLE IF NOT EXISTS run_budget (
  audit_run_id     TEXT PRIMARY KEY,
  budget_usd       REAL NOT NULL DEFAULT 5.0,
  spent_usd        REAL NOT NULL DEFAULT 0.0,
  paused           INTEGER NOT NULL DEFAULT 0,  -- 1 = halt all agents
  phase            TEXT NOT NULL DEFAULT 'boot',
  production_score INTEGER NOT NULL DEFAULT 0,
  alert_50_sent    INTEGER NOT NULL DEFAULT 0,
  alert_80_sent    INTEGER NOT NULL DEFAULT 0,
  alert_95_sent    INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Token usage log (one row per LLM call)
CREATE TABLE IF NOT EXISTS token_usage (
  usage_id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  audit_run_id      TEXT NOT NULL,
  agent_id          TEXT NOT NULL,
  model             TEXT NOT NULL,
  task_type         TEXT NOT NULL,
  prompt_tokens     INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  cached_tokens     INTEGER NOT NULL DEFAULT 0,
  cost_usd          REAL NOT NULL,
  ts                INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Salvation reports (written by salvation protocol)
CREATE TABLE IF NOT EXISTS salvation_reports (
  salvation_id         TEXT PRIMARY KEY,
  audit_run_id         TEXT NOT NULL,
  agent_id             TEXT NOT NULL,
  finding_id           TEXT,
  attempts_json        TEXT NOT NULL,
  research_sources     TEXT NOT NULL,
  human_recommendation TEXT NOT NULL,
  estimated_effort     TEXT NOT NULL,
  blocking_task_ids    TEXT NOT NULL DEFAULT '[]',
  broadcast_message    TEXT NOT NULL,
  created_at           INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Agent errors (every error writes here — no silent failures)
CREATE TABLE IF NOT EXISTS agent_errors (
  error_id     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  audit_run_id TEXT NOT NULL,
  agent_id     TEXT NOT NULL,
  error_type   TEXT NOT NULL,
  error_msg    TEXT NOT NULL,
  file_path    TEXT,
  ts           INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── TRIGGERS: Budget enforcement ──────────────────────────────────────────

-- After every token_usage insert: add to spent_usd and check thresholds
CREATE TRIGGER IF NOT EXISTS trg_token_usage_after_insert
AFTER INSERT ON token_usage
BEGIN
  UPDATE run_budget
  SET spent_usd  = spent_usd + NEW.cost_usd,
      updated_at = unixepoch()
  WHERE audit_run_id = NEW.audit_run_id;

  -- Pause if over budget
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
