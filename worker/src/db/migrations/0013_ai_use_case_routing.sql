CREATE TABLE ai_use_case_routing (
  use_case TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT NOT NULL
);
-- Seed defaults
INSERT INTO ai_use_case_routing VALUES ('doc_extract','google','gemini-2.5-flash',datetime('now'),'system');
INSERT INTO ai_use_case_routing VALUES ('vitals_parse','google','gemini-2.5-flash',datetime('now'),'system');
INSERT INTO ai_use_case_routing VALUES ('test_disambig','anthropic','claude-haiku-4-5-20251001',datetime('now'),'system');
INSERT INTO ai_use_case_routing VALUES ('ref_range','anthropic','claude-haiku-4-5-20251001',datetime('now'),'system');
INSERT INTO ai_use_case_routing VALUES ('voice_trans','deepgram','nova-3',datetime('now'),'system');
