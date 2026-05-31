CREATE TABLE external_api_access_log (
  id          TEXT PRIMARY KEY,
  token_id    TEXT NOT NULL REFERENCES personal_access_tokens(id) ON DELETE CASCADE,
  patient_id  TEXT,
  tool        TEXT NOT NULL,
  kind        TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  error_code  TEXT,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_access_log_token   ON external_api_access_log(token_id);
CREATE INDEX idx_access_log_patient ON external_api_access_log(patient_id);
CREATE INDEX idx_access_log_ts      ON external_api_access_log(created_at);
