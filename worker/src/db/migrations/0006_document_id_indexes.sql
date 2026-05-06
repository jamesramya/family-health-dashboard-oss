-- Add indexes for document_id filtering on extracted data tables.
-- test_results already has idx_test_results_doc from 0001_initial_schema.sql.

CREATE INDEX IF NOT EXISTS idx_scan_findings_document ON scan_findings(document_id);
CREATE INDEX IF NOT EXISTS idx_medications_document ON medications(document_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_document ON clinical_notes(document_id);
