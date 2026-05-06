-- 0001_initial_schema: All tables for family-health-dashboard

-- AUTH ---------------------------------------------------------------
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
  display_name TEXT NOT NULL,
  is_super_admin INTEGER NOT NULL DEFAULT 0,
  must_change_pw INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- PATIENT ------------------------------------------------------------
CREATE TABLE patient (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  gender TEXT NOT NULL,
  blood_type TEXT,
  allergies TEXT, -- JSON array
  photo_r2_key TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT REFERENCES users(id)
);

CREATE TABLE user_patient_access (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'viewer')),
  granted_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, patient_id)
);

-- DOCUMENTS ----------------------------------------------------------
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patient(id),
  type TEXT NOT NULL CHECK (type IN ('blood_report','scan','ecg','prescription','consultation','other')),
  title TEXT NOT NULL,
  document_date TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  source_lab TEXT,
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending','processing','complete','failed')),
  workflow_instance_id TEXT,
  llm_raw_response TEXT,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT REFERENCES users(id)
);
CREATE INDEX idx_documents_patient ON documents(patient_id);
CREATE INDEX idx_documents_type ON documents(type);
CREATE INDEX idx_documents_status ON documents(processing_status);

-- BLOOD WORK ---------------------------------------------------------
CREATE TABLE test_definitions (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN (
    'haematology','electrolytes','liver_function','renal_function',
    'bone_profile','coagulation','drug_levels','inflammatory',
    'thyroid_function','blood_glucose','lipid_profile','other'
  )),
  ref_low REAL,
  ref_high REAL,
  ref_source TEXT DEFAULT 'lab',
  note TEXT,
  aliases TEXT DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE test_results (
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
  deleted_by TEXT REFERENCES users(id)
);
CREATE INDEX idx_test_results_patient ON test_results(patient_id);
CREATE INDEX idx_test_results_def ON test_results(test_def_id);
CREATE INDEX idx_test_results_doc ON test_results(document_id);
CREATE INDEX idx_test_results_date ON test_results(patient_id, date);

-- VITALS -------------------------------------------------------------
CREATE TABLE vital_readings (
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
CREATE INDEX idx_vitals_patient_type ON vital_readings(patient_id, type);

-- SCANS --------------------------------------------------------------
CREATE TABLE scan_findings (
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
CREATE INDEX idx_scans_patient ON scan_findings(patient_id);

-- MEDICATIONS --------------------------------------------------------
CREATE TABLE medications (
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
  deleted_by TEXT REFERENCES users(id)
);
CREATE INDEX idx_meds_patient ON medications(patient_id);

CREATE TABLE medication_schedules (
  id TEXT PRIMARY KEY,
  medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  time_of_day TEXT NOT NULL CHECK (time_of_day IN ('morning','afternoon','evening','night','bedtime','as_needed')),
  meal_relation TEXT NOT NULL CHECK (meal_relation IN ('before_meal','after_meal','with_meal','empty_stomach','not_applicable')),
  dose_quantity REAL NOT NULL,
  specific_time TEXT,
  instructions TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT REFERENCES users(id)
);
CREATE INDEX idx_schedules_med ON medication_schedules(medication_id);

-- CLINICAL NOTES -----------------------------------------------------
CREATE TABLE clinical_notes (
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
CREATE INDEX idx_notes_patient ON clinical_notes(patient_id);

-- PURGE LOG -----------------------------------------------------------
CREATE TABLE purge_log (
  id TEXT PRIMARY KEY,
  purged_at TEXT NOT NULL DEFAULT (datetime('now')),
  tables_affected TEXT NOT NULL,
  total_rows INTEGER NOT NULL,
  r2_objects_deleted INTEGER NOT NULL DEFAULT 0
);
