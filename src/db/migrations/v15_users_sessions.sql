-- v15: user accounts and persistent sessions
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  tenant_id     TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin', 'member')),
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

CREATE TABLE IF NOT EXISTS user_sessions (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(12)))),
  user_id     TEXT NOT NULL,
  tenant_id   TEXT NOT NULL,
  token_hash  TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  revoked_at  INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant ON user_sessions(tenant_id);
