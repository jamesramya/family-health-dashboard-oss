-- 0003_document_sha256: Add sha256 to documents for dedup and dedup index to test_results

-- Add sha256 column (nullable — existing rows and migrated rows without a hash are NULL)
ALTER TABLE documents ADD COLUMN sha256 TEXT;

-- Partial unique index: only enforce uniqueness on live rows that have a hash.
-- Scoped to patient_id so the same file can exist for different patients.
-- is_deleted = 0 means a soft-deleted doc can be re-uploaded without conflict.
CREATE UNIQUE INDEX idx_documents_sha256
  ON documents(patient_id, sha256)
  WHERE sha256 IS NOT NULL AND is_deleted = 0;

-- Dedup index on test_results: prevents duplicate readings from re-extraction or migration re-runs.
-- Relies on report_file being non-null (enforced at application layer — extractor uses documentId as fallback).
CREATE UNIQUE INDEX idx_test_results_dedup
  ON test_results(patient_id, test_def_id, date, report_file)
  WHERE is_deleted = 0;
