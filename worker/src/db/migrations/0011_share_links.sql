-- share_links table
CREATE TABLE share_links (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  patient_ids TEXT NOT NULL DEFAULT '[]',
  scopes TEXT NOT NULL DEFAULT '["read"]',
  expires_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_share_links_token ON share_links(token_hash);
CREATE INDEX idx_share_links_creator ON share_links(created_by);
