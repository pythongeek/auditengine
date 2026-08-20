-- v16: Repository bookmarks table
CREATE TABLE IF NOT EXISTS repositories (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  tenant_id       TEXT NOT NULL,
  provider        TEXT NOT NULL DEFAULT 'github',
  owner           TEXT,
  repo            TEXT,
  url             TEXT NOT NULL,
  default_branch  TEXT NOT NULL DEFAULT 'main',
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_repositories_tenant ON repositories(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_repositories_tenant_url ON repositories(tenant_id, url);
