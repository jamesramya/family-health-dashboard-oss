-- 0008_culture_results.sql
-- Expands documents.type to include 'culture_report' and adds culture_results table.
--
-- D1 constraints:
--   - PRAGMA foreign_keys is always ON (read-only)
--   - SQLite 3.26+ auto-updates FK references in child tables on ALTER TABLE RENAME
--     (causing DROP TABLE on the renamed table to fail due to child FK refs)
--   - PRAGMA legacy_alter_table = ON disables the auto-update so child tables
--     keep referencing 'documents' (the new table) after the rename
--
-- documents_old is left in place as a data backup; it may be dropped manually
-- once the migration is confirmed stable.

PRAGMA legacy_alter_table = ON;

ALTER TABLE documents RENAME TO documents_old;

CREATE TABLE documents (
  id                        TEXT PRIMARY KEY,
  patient_id                TEXT NOT NULL,
  type                      TEXT NOT NULL CHECK (type IN (
                              'blood_report','scan','ecg','prescription',
                              'consultation','other','culture_report')),
  title                     TEXT NOT NULL,
  document_date             TEXT NOT NULL,
  r2_key                    TEXT NOT NULL,
  mime_type                 TEXT NOT NULL,
  file_size_bytes           INTEGER NOT NULL,
  source_lab                TEXT,
  processing_status         TEXT NOT NULL DEFAULT 'pending'
                              CHECK (processing_status IN ('pending','processing','complete','failed')),
  workflow_instance_id      TEXT,
  llm_raw_response          TEXT,
  sha256                    TEXT,
  uploaded_by               TEXT NOT NULL,
  created_by                TEXT NOT NULL,
  updated_by                TEXT NOT NULL,
  created_at                TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                TEXT NOT NULL DEFAULT (datetime('now')),
  is_deleted                INTEGER NOT NULL DEFAULT 0,
  deleted_at                TEXT,
  deleted_by                TEXT,
  medication_review_status  TEXT CHECK (medication_review_status IN ('pending_review','reviewed')),
  medication_review_decisions TEXT DEFAULT '[]'
);

-- Drop indexes from documents_old before recreating them on new documents
-- (SQLite index names are global; they don't rename when their table renames)
DROP INDEX IF EXISTS idx_documents_patient;
DROP INDEX IF EXISTS idx_documents_type;
DROP INDEX IF EXISTS idx_documents_status;
DROP INDEX IF EXISTS idx_documents_sha256;

INSERT INTO documents
  (id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes,
   source_lab, processing_status, workflow_instance_id, llm_raw_response, sha256,
   uploaded_by, created_by, updated_by, created_at, updated_at, is_deleted,
   deleted_at, deleted_by, medication_review_status, medication_review_decisions)
SELECT
  id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes,
  source_lab, processing_status, workflow_instance_id, llm_raw_response, sha256,
  uploaded_by, created_by, updated_by, created_at, updated_at, is_deleted,
  deleted_at, deleted_by, medication_review_status, medication_review_decisions
FROM documents_old;

CREATE INDEX idx_documents_patient  ON documents(patient_id);
CREATE INDEX idx_documents_type     ON documents(type);
CREATE INDEX idx_documents_status   ON documents(processing_status);
CREATE UNIQUE INDEX idx_documents_sha256
  ON documents(patient_id, sha256)
  WHERE sha256 IS NOT NULL AND is_deleted = 0;

-- New table for microbiology culture results
CREATE TABLE culture_results (
  id              TEXT PRIMARY KEY,
  document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  patient_id      TEXT NOT NULL,
  specimen_type   TEXT NOT NULL CHECK (specimen_type IN ('blood','urine','sputum','other')),
  collection_date TEXT,
  result_status   TEXT NOT NULL CHECK (result_status IN ('positive','negative','no_growth','contaminated')),
  organism        TEXT,
  growth_quantity TEXT CHECK (growth_quantity IN ('light','moderate','heavy') OR growth_quantity IS NULL),
  sensitivities   TEXT NOT NULL DEFAULT '[]',
  comments        TEXT,
  created_by      TEXT NOT NULL,
  updated_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  is_deleted      INTEGER NOT NULL DEFAULT 0,
  deleted_at      TEXT,
  deleted_by      TEXT
);

CREATE INDEX idx_culture_results_patient  ON culture_results(patient_id);
CREATE INDEX idx_culture_results_document ON culture_results(document_id);
