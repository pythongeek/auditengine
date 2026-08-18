-- Migration: add multi-repository group support (repo groups, members, dependencies)

CREATE TABLE IF NOT EXISTS repo_groups (
  group_id   TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL DEFAULT '',
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_repo_groups_tenant ON repo_groups(tenant_id);

CREATE TABLE IF NOT EXISTS repo_group_members (
  group_id     TEXT NOT NULL,
  audit_run_id TEXT NOT NULL,
  role         TEXT NOT NULL CHECK(role IN ('consumer','dependency','service')),
  PRIMARY KEY (group_id, audit_run_id)
);
CREATE INDEX IF NOT EXISTS idx_repo_group_members_run ON repo_group_members(audit_run_id);
CREATE INDEX IF NOT EXISTS idx_repo_group_members_group ON repo_group_members(group_id);

CREATE TABLE IF NOT EXISTS repo_dependencies (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  tenant_id        TEXT NOT NULL DEFAULT '',
  group_id         TEXT NOT NULL,
  dependency_path  TEXT NOT NULL,
  consumer_run_id  TEXT NOT NULL,
  provider_run_id  TEXT NOT NULL,
  UNIQUE(group_id, dependency_path, consumer_run_id, provider_run_id)
);
CREATE INDEX IF NOT EXISTS idx_repo_dependencies_provider ON repo_dependencies(provider_run_id, dependency_path);
CREATE INDEX IF NOT EXISTS idx_repo_dependencies_consumer ON repo_dependencies(consumer_run_id, dependency_path);
CREATE INDEX IF NOT EXISTS idx_repo_dependencies_group ON repo_dependencies(group_id);
