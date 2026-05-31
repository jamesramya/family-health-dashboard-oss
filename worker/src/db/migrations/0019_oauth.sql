CREATE TABLE oauth_clients (
  id                         TEXT PRIMARY KEY,
  client_name                TEXT NOT NULL,
  redirect_uris              TEXT NOT NULL,
  grant_types                TEXT NOT NULL DEFAULT 'authorization_code,refresh_token',
  response_types             TEXT NOT NULL DEFAULT 'code',
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
  scope                      TEXT NOT NULL DEFAULT 'mcp.read',
  software_id                TEXT,
  software_version           TEXT,
  created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at               TEXT
);

CREATE TABLE oauth_auth_codes (
  code_hash             TEXT PRIMARY KEY,
  client_id             TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id               TEXT NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  redirect_uri          TEXT NOT NULL,
  code_challenge        TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256' CHECK (code_challenge_method = 'S256'),
  scope                 TEXT NOT NULL,
  resource              TEXT NOT NULL,
  expires_at            TEXT NOT NULL,
  consumed_at           TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_oauth_auth_codes_expires ON oauth_auth_codes(expires_at);

CREATE TABLE oauth_refresh_tokens (
  id              TEXT PRIMARY KEY,
  token_hash      TEXT NOT NULL UNIQUE,
  access_token_id TEXT NOT NULL REFERENCES personal_access_tokens(id) ON DELETE CASCADE,
  client_id       TEXT NOT NULL REFERENCES oauth_clients(id)          ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id)                  ON DELETE CASCADE,
  scope           TEXT NOT NULL,
  resource        TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  rotated_to      TEXT,
  revoked_at      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_oauth_refresh_user   ON oauth_refresh_tokens(user_id);
CREATE INDEX idx_oauth_refresh_client ON oauth_refresh_tokens(client_id);
CREATE INDEX idx_oauth_refresh_expires ON oauth_refresh_tokens(expires_at);

ALTER TABLE personal_access_tokens ADD COLUMN client_id TEXT REFERENCES oauth_clients(id);
ALTER TABLE personal_access_tokens ADD COLUMN issued_via TEXT NOT NULL DEFAULT 'pat'
  CHECK (issued_via IN ('pat', 'oauth'));
CREATE INDEX idx_pat_client_id ON personal_access_tokens(client_id);
