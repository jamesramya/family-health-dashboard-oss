CREATE TABLE personal_access_tokens (
  id                          TEXT PRIMARY KEY,
  user_id                     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                        TEXT NOT NULL,
  token_hash                  TEXT NOT NULL UNIQUE,
  token_prefix                TEXT NOT NULL,
  token_suffix                TEXT NOT NULL,
  scopes                      TEXT NOT NULL DEFAULT 'read',
  target_platform             TEXT,
  pat_consent_acknowledged_at TEXT NOT NULL,
  last_used_at                TEXT,
  revoked_at                  TEXT,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at                  TEXT,
  UNIQUE(user_id, name)
);
CREATE INDEX idx_pat_user  ON personal_access_tokens(user_id);
CREATE INDEX idx_pat_hash  ON personal_access_tokens(token_hash);
