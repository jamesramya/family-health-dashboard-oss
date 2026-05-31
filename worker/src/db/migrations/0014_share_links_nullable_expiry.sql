-- Make expires_at nullable on share_links to support "never expires" links.
-- SQLite cannot drop NOT NULL via ALTER TABLE, so recreate the table.
CREATE TABLE share_links_new (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  patient_ids TEXT NOT NULL DEFAULT '[]',
  scopes TEXT NOT NULL DEFAULT '["read"]',
  expires_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO share_links_new SELECT * FROM share_links;
DROP TABLE share_links;
ALTER TABLE share_links_new RENAME TO share_links;
CREATE INDEX idx_share_links_token ON share_links(token_hash);
CREATE INDEX idx_share_links_creator ON share_links(created_by);
