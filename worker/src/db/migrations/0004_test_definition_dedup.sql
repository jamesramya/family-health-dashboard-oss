-- 0004_test_definition_dedup.sql
-- Add canonical_key (UNIQUE), needs_review, ref_note, and soft-delete columns to test_definitions.
-- Add per-reading ref range columns to test_results.
-- Create disambiguation_log table for LLM audit trail.
--
-- Uses ALTER TABLE ADD COLUMN to avoid DROP TABLE, which fails on D1
-- because test_results has a FOREIGN KEY referencing test_definitions(id)
-- and D1 exposes PRAGMA foreign_keys as read-only (always ON).
--
-- Note: canonical_name retains its inline UNIQUE constraint (cannot be
-- dropped without table rebuild). The merger code handles this gracefully
-- via the stage-1 canonical_name fallback before inserting new rows.
--
-- Backup table preserved for rollback. Delete manually after stable operation.

-- Backup existing data
CREATE TABLE test_definitions_backup_20260416 AS SELECT * FROM test_definitions;

-- Add new columns (canonical_key nullable to avoid DEFAULT collision during UPDATE)
ALTER TABLE test_definitions ADD COLUMN canonical_key TEXT;
ALTER TABLE test_definitions ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0;
ALTER TABLE test_definitions ADD COLUMN ref_note TEXT;
ALTER TABLE test_definitions ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE test_definitions ADD COLUMN deleted_at TEXT;
ALTER TABLE test_definitions ADD COLUMN deleted_by TEXT;

-- Populate canonical_key for existing rows with collision-safe id suffix
-- (real dedup happens in Part B via the CLI arbiter)
UPDATE test_definitions
SET canonical_key = LOWER(REPLACE(REPLACE(REPLACE(canonical_name, ' ', ''), '_', ''), ',', ''))
  || '_' || SUBSTR(id, 1, 8);

-- Enforce uniqueness on canonical_key going forward
CREATE UNIQUE INDEX idx_test_definitions_canonical_key ON test_definitions(canonical_key);

-- test_results: per-reading lab range
ALTER TABLE test_results ADD COLUMN ref_low_at_test REAL;
ALTER TABLE test_results ADD COLUMN ref_high_at_test REAL;

-- disambiguation_log: audit trail of LLM decisions
CREATE TABLE disambiguation_log (
  id TEXT PRIMARY KEY,
  raw_name TEXT,
  canonical_name_extracted TEXT,
  key_extracted TEXT,
  matched_test_def_id TEXT REFERENCES test_definitions(id),
  is_duplicate INTEGER NOT NULL,
  llm_model TEXT NOT NULL,
  llm_reasoning TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_disambiguation_log_created ON disambiguation_log(created_at);
CREATE INDEX idx_test_definitions_needs_review ON test_definitions(needs_review) WHERE needs_review = 1;
