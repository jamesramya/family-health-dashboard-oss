-- 0009_fix_document_fk_references.sql
-- Repairs FK references broken by migration 0008.
--
-- Root cause: D1 silently ignores PRAGMA legacy_alter_table = ON and always
-- auto-updates child-table FK references when a parent is renamed. When 0008
-- renamed 'documents' → 'documents_old', all five child tables had their
-- document_id FK rewritten to REFERENCES "documents_old"(id). This caused
-- bare INSERTs (e.g. clinical_notes) to throw FK constraint errors for any
-- document uploaded after 0008, and INSERT OR IGNORE tables (e.g. test_results)
-- to silently drop rows.
--
-- Strategy: for each affected table, create a _new copy with the correct FK,
-- copy all data, drop the old indexes, rename old → _backup, rename new →
-- canonical, recreate indexes. _backup tables are left in place as a safety
-- net and may be dropped in a later migration once stable.
--
-- Note: renaming 'medications' auto-updates medication_schedules.medication_id
-- to REFERENCES medications_backup(id), so medication_schedules is also
-- recreated immediately after medications.
--
-- This migration was applied directly via D1 MCP on 2026-04-22 to both
-- staging and production before being committed here.

-- ── vital_readings ─────────────────────────────────────────────────────────

CREATE TABLE vital_readings_new (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patient(id),
  document_id TEXT REFERENCES documents(id),
  type TEXT NOT NULL CHECK (type IN ('bp','glucose','weight','heart_rate','spo2','temperature')),
  measured_at TEXT NOT NULL,
  value_primary REAL NOT NULL,
  value_secondary REAL,
  value_tertiary REAL,
  unit TEXT NOT NULL,
  context TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','csv_import','device_sync')),
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT REFERENCES users(id)
);
INSERT INTO vital_readings_new SELECT * FROM vital_readings;
DROP INDEX idx_vitals_patient_type;
ALTER TABLE vital_readings RENAME TO vital_readings_backup;
ALTER TABLE vital_readings_new RENAME TO vital_readings;
CREATE INDEX idx_vitals_patient_type ON vital_readings(patient_id, type);

-- ── scan_findings ──────────────────────────────────────────────────────────

CREATE TABLE scan_findings_new (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  patient_id TEXT NOT NULL REFERENCES patient(id),
  scan_type TEXT NOT NULL CHECK (scan_type IN ('xray','ct','mri','ultrasound','ecg','other')),
  body_area TEXT NOT NULL,
  findings_summary TEXT NOT NULL,
  impression TEXT,
  ordering_doctor TEXT,
  scan_date TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT REFERENCES users(id)
);
INSERT INTO scan_findings_new SELECT * FROM scan_findings;
DROP INDEX idx_scan_findings_document;
DROP INDEX idx_scans_patient;
ALTER TABLE scan_findings RENAME TO scan_findings_backup;
ALTER TABLE scan_findings_new RENAME TO scan_findings;
CREATE INDEX idx_scan_findings_document ON scan_findings(document_id);
CREATE INDEX idx_scans_patient ON scan_findings(patient_id);

-- ── clinical_notes ─────────────────────────────────────────────────────────

CREATE TABLE clinical_notes_new (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patient(id),
  document_id TEXT REFERENCES documents(id),
  visit_date TEXT NOT NULL,
  doctor_name TEXT,
  facility TEXT,
  diagnosis TEXT,
  summary TEXT NOT NULL,
  treatment_plan TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT REFERENCES users(id)
);
INSERT INTO clinical_notes_new SELECT * FROM clinical_notes;
DROP INDEX idx_clinical_notes_document;
DROP INDEX idx_notes_patient;
ALTER TABLE clinical_notes RENAME TO clinical_notes_backup;
ALTER TABLE clinical_notes_new RENAME TO clinical_notes;
CREATE INDEX idx_clinical_notes_document ON clinical_notes(document_id);
CREATE INDEX idx_notes_patient ON clinical_notes(patient_id);

-- ── medications ────────────────────────────────────────────────────────────
-- Renaming medications will auto-corrupt medication_schedules.medication_id;
-- medication_schedules is recreated immediately below.

CREATE TABLE medications_new (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patient(id),
  document_id TEXT REFERENCES documents(id),
  brand_name TEXT NOT NULL,
  generic_name TEXT,
  dosage TEXT NOT NULL,
  form TEXT NOT NULL CHECK (form IN ('tablet','capsule','syrup','injection','cream','drops','inhaler','other')),
  prescribing_doctor TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  reason TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT REFERENCES users(id),
  lifecycle_events TEXT DEFAULT '[]',
  prescription_ids TEXT DEFAULT '[]'
);
INSERT INTO medications_new SELECT * FROM medications;
DROP INDEX idx_medications_document;
DROP INDEX idx_meds_patient;
ALTER TABLE medications RENAME TO medications_backup;
ALTER TABLE medications_new RENAME TO medications;
CREATE INDEX idx_medications_document ON medications(document_id);
CREATE INDEX idx_meds_patient ON medications(patient_id);

-- ── medication_schedules (re-point to medications, not medications_backup) ─

CREATE TABLE medication_schedules_new (
  id TEXT PRIMARY KEY,
  medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  time_of_day TEXT NOT NULL CHECK (time_of_day IN ('morning','afternoon','evening','night','bedtime','as_needed')),
  meal_relation TEXT NOT NULL CHECK (meal_relation IN ('before_meal','after_meal','with_meal','empty_stomach','not_applicable')),
  specific_time TEXT,
  instructions TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT REFERENCES users(id),
  days_of_week TEXT,
  dose_quantity TEXT
);
INSERT INTO medication_schedules_new SELECT * FROM medication_schedules;
DROP INDEX idx_schedules_med;
ALTER TABLE medication_schedules RENAME TO medication_schedules_backup;
ALTER TABLE medication_schedules_new RENAME TO medication_schedules;
CREATE INDEX idx_schedules_med ON medication_schedules(medication_id);

-- ── test_results ───────────────────────────────────────────────────────────

CREATE TABLE test_results_new (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patient(id),
  test_def_id TEXT NOT NULL REFERENCES test_definitions(id),
  document_id TEXT REFERENCES documents(id),
  date TEXT NOT NULL,
  value REAL,
  value_text TEXT,
  flag TEXT NOT NULL CHECK (flag IN ('HIGH','LOW','NORMAL')),
  source_lab TEXT,
  report_file TEXT,
  extracted_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT REFERENCES users(id),
  ref_low_at_test REAL,
  ref_high_at_test REAL
);
INSERT INTO test_results_new SELECT * FROM test_results;
DROP INDEX idx_test_results_date;
DROP INDEX idx_test_results_dedup;
DROP INDEX idx_test_results_def;
DROP INDEX idx_test_results_doc;
DROP INDEX idx_test_results_patient;
ALTER TABLE test_results RENAME TO test_results_backup;
ALTER TABLE test_results_new RENAME TO test_results;
CREATE INDEX idx_test_results_patient ON test_results(patient_id);
CREATE INDEX idx_test_results_def ON test_results(test_def_id);
CREATE INDEX idx_test_results_doc ON test_results(document_id);
CREATE INDEX idx_test_results_date ON test_results(patient_id, date);
CREATE UNIQUE INDEX idx_test_results_dedup ON test_results(test_def_id, document_id, date);
