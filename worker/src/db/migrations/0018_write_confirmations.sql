CREATE TABLE write_confirmations (
  id           TEXT PRIMARY KEY,
  token_id     TEXT NOT NULL REFERENCES personal_access_tokens(id) ON DELETE CASCADE,
  tool         TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_wc_token   ON write_confirmations(token_id);
CREATE INDEX idx_wc_expires ON write_confirmations(expires_at);
