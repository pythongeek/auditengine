// Idempotent migration runner for AuditEngine D1 schema.
// All statements use CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS so
// this can be called safely on every boot or deploy.

const MIGRATION_STATEMENTS: string[] = [
  `-- tenants: multi-tenant isolation root
CREATE TABLE IF NOT EXISTS tenants (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  plan       TEXT NOT NULL DEFAULT 'free',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);`,

  `-- claims: atomic file ownership
CREATE TABLE IF NOT EXISTS claims (
  claim_id     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  tenant_id    TEXT NOT NULL DEFAULT '',
  audit_run_id TEXT NOT NULL,
  agent_id     TEXT NOT NULL,
  file_path    TEXT NOT NULL,
  claimed_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(tenant_id, audit_run_id, file_path)
);
CREATE INDEX IF NOT EXISTS idx_claims_tenant_run ON claims(tenant_id, audit_run_id);`,

  `-- repo_manifest: legacy file manifest (kept for backward compatibility)
CREATE TABLE IF NOT EXISTS repo_manifest (
  manifest_id  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  tenant_id    TEXT NOT NULL DEFAULT '',
  audit_run_id TEXT NOT NULL,
  file_path    TEXT NOT NULL,
  domain       TEXT NOT NULL,
  chunk_count  INTEGER NOT NULL DEFAULT 1,
  byte_size    INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT,
  language     TEXT,
  last_modified INTEGER,
  indexed_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_manifest_tenant_run_domain ON repo_manifest(tenant_id, audit_run_id, domain);
CREATE INDEX IF NOT EXISTS idx_manifest_run_domain ON repo_manifest(audit_run_id, domain);`,

  `-- files: PRD/RFC-aligned file metadata and domain tagging
CREATE TABLE IF NOT EXISTS files (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  tenant_id         TEXT NOT NULL DEFAULT '',
  audit_run_id      TEXT NOT NULL,
  path              TEXT NOT NULL,
  language          TEXT,
  domain_tag        TEXT,
  line_count        INTEGER NOT NULL DEFAULT 0,
  chunk_count       INTEGER NOT NULL DEFAULT 1,
  r2_key            TEXT NOT NULL,
  last_analyzed_at  INTEGER,
  content_hash      TEXT,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(tenant_id, audit_run_id, path)
);
CREATE INDEX IF NOT EXISTS idx_files_tenant_run_domain ON files(tenant_id, audit_run_id, domain_tag);
CREATE INDEX IF NOT EXISTS idx_files_run_domain ON files(audit_run_id, domain_tag);`,

  `-- findings: structured audit findings with evidence
CREATE TABLE IF NOT EXISTS findings (
  finding_id       TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL DEFAULT '',
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
  verified_by      TEXT NOT NULL,
  source           TEXT NOT NULL DEFAULT 'agent',
  status           TEXT NOT NULL DEFAULT 'open',
  recurrence_count INTEGER NOT NULL DEFAULT 0,
  ts               INTEGER NOT NULL DEFAULT (unixepoch()),
  verified_at      INTEGER,
  screenshot_id    TEXT
);
CREATE INDEX IF NOT EXISTS idx_findings_tenant_run     ON findings(tenant_id, audit_run_id);
CREATE INDEX IF NOT EXISTS idx_findings_run            ON findings(audit_run_id);
CREATE INDEX IF NOT EXISTS idx_findings_tenant_file    ON findings(tenant_id, file);
CREATE INDEX IF NOT EXISTS idx_findings_file           ON findings(audit_run_id, file);
CREATE INDEX IF NOT EXISTS idx_findings_tenant_severity ON findings(tenant_id, severity);
CREATE INDEX IF NOT EXISTS idx_findings_severity       ON findings(audit_run_id, severity);`,

  `-- tasks: prioritized remediation work
CREATE TABLE IF NOT EXISTS tasks (
  task_id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  tenant_id        TEXT NOT NULL DEFAULT '',
  audit_run_id     TEXT NOT NULL,
  title            TEXT NOT NULL,
  finding_ids      TEXT NOT NULL,
  priority_score   REAL NOT NULL DEFAULT 0,
  multipliers      TEXT NOT NULL DEFAULT '[]',
  status           TEXT NOT NULL DEFAULT 'backlog',
  assigned_agent   TEXT,
  commit_sha       TEXT,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  conflict_flag    INTEGER NOT NULL DEFAULT 0,
  conflict_reason  TEXT,
  lock_expires_at  INTEGER,
  plan_text        TEXT,
  plan_status      TEXT NOT NULL DEFAULT 'none'
);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_run_status ON tasks(tenant_id, audit_run_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_run_status ON tasks(audit_run_id, status);`,

  `-- agent_registry: spawned agent tracking
CREATE TABLE IF NOT EXISTS agent_registry (
  agent_id     TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL DEFAULT '',
  agent_type   TEXT NOT NULL,
  audit_run_id TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'boot',
  phase        INTEGER NOT NULL DEFAULT 1,
  spawned_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  done_at      INTEGER,
  queue_cursor INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_registry_tenant_run ON agent_registry(tenant_id, audit_run_id, status);
CREATE INDEX IF NOT EXISTS idx_registry_run ON agent_registry(audit_run_id, status);`,

  `-- run_budget: per-audit budget and phase
CREATE TABLE IF NOT EXISTS run_budget (
  audit_run_id     TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL DEFAULT '',
  budget_usd       REAL NOT NULL DEFAULT 5.0,
  spent_usd        REAL NOT NULL DEFAULT 0.0,
  paused           INTEGER NOT NULL DEFAULT 0,
  phase            TEXT NOT NULL DEFAULT 'boot',
  production_score INTEGER NOT NULL DEFAULT 0,
  alert_50_sent    INTEGER NOT NULL DEFAULT 0,
  alert_80_sent    INTEGER NOT NULL DEFAULT 0,
  alert_95_sent    INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_run_budget_tenant ON run_budget(tenant_id);`,

  `-- token_usage: one row per LLM call
CREATE TABLE IF NOT EXISTS token_usage (
  usage_id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  tenant_id         TEXT NOT NULL DEFAULT '',
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
CREATE INDEX IF NOT EXISTS idx_token_usage_tenant_ts ON token_usage(tenant_id, ts);`,

  `-- salvation_reports: Salvation Protocol output
CREATE TABLE IF NOT EXISTS salvation_reports (
  salvation_id         TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL DEFAULT '',
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
CREATE INDEX IF NOT EXISTS idx_salvation_tenant_run ON salvation_reports(tenant_id, audit_run_id);`,

  `-- agent_errors: every error writes here
CREATE TABLE IF NOT EXISTS agent_errors (
  error_id     TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  tenant_id    TEXT NOT NULL DEFAULT '',
  audit_run_id TEXT NOT NULL,
  agent_id     TEXT NOT NULL,
  error_type   TEXT NOT NULL,
  error_msg    TEXT NOT NULL,
  file_path    TEXT,
  ts           INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_agent_errors_tenant_run ON agent_errors(tenant_id, audit_run_id);`,

  `-- audit_sessions: top-level audit run tracking
CREATE TABLE IF NOT EXISTS audit_sessions (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL DEFAULT '',
  repo_url         TEXT NOT NULL DEFAULT '',
  repo_branch      TEXT NOT NULL DEFAULT 'main',
  status           TEXT NOT NULL DEFAULT 'pending',
  total_files      INTEGER NOT NULL DEFAULT 0,
  files_analyzed   INTEGER NOT NULL DEFAULT 0,
  findings_count   INTEGER NOT NULL DEFAULT 0,
  readiness_score  REAL NOT NULL DEFAULT 0.0,
  started_at       INTEGER,
  completed_at     INTEGER,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_audit_sessions_tenant ON audit_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_sessions_status ON audit_sessions(status);`,

  `-- agent_config: per-tenant per-agent behavioral tuning
CREATE TABLE IF NOT EXISTS agent_config (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  tenant_id         TEXT NOT NULL DEFAULT '',
  agent_id          TEXT NOT NULL,
  model_provider    TEXT NOT NULL DEFAULT 'kimi',
  model_name        TEXT NOT NULL DEFAULT 'kimi-k3',
  temperature       REAL NOT NULL DEFAULT 0.1,
  top_p             REAL NOT NULL DEFAULT 0.85,
  max_tokens        INTEGER NOT NULL DEFAULT 4096,
  evidence_required INTEGER NOT NULL DEFAULT 1,
  max_retries       INTEGER NOT NULL DEFAULT 3,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(tenant_id, agent_id)
);
CREATE INDEX IF NOT EXISTS idx_agent_config_tenant ON agent_config(tenant_id);`,

  `-- audit_logs: comprehensive audit trail
CREATE TABLE IF NOT EXISTS audit_logs (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  tenant_id     TEXT NOT NULL DEFAULT '',
  audit_run_id  TEXT NOT NULL,
  agent_id      TEXT,
  event_type    TEXT NOT NULL,
  event_data    TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_run ON audit_logs(tenant_id, audit_run_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_run ON audit_logs(audit_run_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_type ON audit_logs(event_type);`,
]

export async function migrate(db: D1Database): Promise<void> {
  for (const sql of MIGRATION_STATEMENTS) {
    await db.prepare(sql).run()
  }
  // Idempotent column additions for databases created before v14.
  for (const alter of [
    "ALTER TABLE tasks ADD COLUMN plan_text TEXT",
    "ALTER TABLE tasks ADD COLUMN plan_status TEXT NOT NULL DEFAULT 'none'",
  ]) {
    try {
      await db.prepare(alter).run()
    } catch {
      // Column already exists — safe to ignore.
    }
  }
}

export async function migrateRepoManifestToFiles(db: D1Database, auditRunId: string): Promise<number> {
  const rows = await db
    .prepare(`
      SELECT tenant_id, audit_run_id, file_path, domain, chunk_count, byte_size,
             content_hash, language, last_modified, r2_key
      FROM repo_manifest
      WHERE audit_run_id = ?
    `)
    .bind(auditRunId)
    .all<{
      tenant_id: string
      audit_run_id: string
      file_path: string
      domain: string
      chunk_count: number
      byte_size: number
      content_hash: string | null
      language: string | null
      last_modified: number | null
      r2_key: string
    }>()

  const results = rows.results ?? []
  if (results.length === 0) return 0

  const statements = results.map(row =>
    db
      .prepare(`
        INSERT OR IGNORE INTO files (
          tenant_id, audit_run_id, path, domain_tag, line_count, chunk_count,
          r2_key, last_analyzed_at, content_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
      `)
      .bind(
        row.tenant_id,
        row.audit_run_id,
        row.file_path,
        row.domain,
        row.byte_size,
        row.chunk_count,
        row.r2_key,
        row.last_modified,
        row.content_hash
      )
  )

  await db.batch(statements)
  return results.length
}
