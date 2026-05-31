// Inline migration SQL so tests don't depend on filesystem access
// (the @cloudflare/vitest-pool-workers sandbox can't read the real FS).
const MIGRATIONS_SQL = `
-- 0001_initial_schema
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
CREATE TABLE patient (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  gender TEXT NOT NULL,
  blood_type TEXT,
  allergies TEXT,
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
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patient(id),
  type TEXT NOT NULL CHECK (type IN ('blood_report','scan','ecg','prescription','consultation','other','culture_report')),
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
CREATE TABLE purge_log (
  id TEXT PRIMARY KEY,
  purged_at TEXT NOT NULL DEFAULT (datetime('now')),
  tables_affected TEXT NOT NULL,
  total_rows INTEGER NOT NULL,
  r2_objects_deleted INTEGER NOT NULL DEFAULT 0
);

-- 0002_medication_schedule_updates
ALTER TABLE medication_schedules ADD COLUMN days_of_week TEXT;
ALTER TABLE medication_schedules ADD COLUMN dose_quantity_text TEXT;
UPDATE medication_schedules SET dose_quantity_text = CAST(dose_quantity AS TEXT) WHERE dose_quantity IS NOT NULL;
ALTER TABLE medication_schedules DROP COLUMN dose_quantity;
ALTER TABLE medication_schedules RENAME COLUMN dose_quantity_text TO dose_quantity;

-- 0003_document_sha256
ALTER TABLE documents ADD COLUMN sha256 TEXT;
CREATE UNIQUE INDEX idx_documents_sha256 ON documents(patient_id, sha256) WHERE sha256 IS NOT NULL AND is_deleted = 0;
CREATE UNIQUE INDEX idx_test_results_dedup ON test_results(patient_id, test_def_id, date, report_file) WHERE is_deleted = 0;

-- 0004_test_definition_dedup (backup table omitted — not needed in tests)
ALTER TABLE test_definitions ADD COLUMN canonical_key TEXT;
ALTER TABLE test_definitions ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0;
ALTER TABLE test_definitions ADD COLUMN ref_note TEXT;
ALTER TABLE test_definitions ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE test_definitions ADD COLUMN deleted_at TEXT;
ALTER TABLE test_definitions ADD COLUMN deleted_by TEXT;
UPDATE test_definitions
SET canonical_key = LOWER(REPLACE(REPLACE(REPLACE(canonical_name, ' ', ''), '_', ''), ',', ''))
  || '_' || SUBSTR(id, 1, 8);
CREATE UNIQUE INDEX idx_test_definitions_canonical_key ON test_definitions(canonical_key);
ALTER TABLE test_results ADD COLUMN ref_low_at_test REAL;
ALTER TABLE test_results ADD COLUMN ref_high_at_test REAL;
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

-- 0005_test_results_unique_index
DROP INDEX IF EXISTS idx_test_results_dedup;
CREATE UNIQUE INDEX IF NOT EXISTS idx_test_results_dedup
  ON test_results(test_def_id, document_id, date);

-- 0006_document_id_indexes
CREATE INDEX IF NOT EXISTS idx_scan_findings_document ON scan_findings(document_id);
CREATE INDEX IF NOT EXISTS idx_medications_document ON medications(document_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_document ON clinical_notes(document_id);

-- 0007_medication_lifecycle
ALTER TABLE documents ADD COLUMN medication_review_status TEXT
  CHECK (medication_review_status IN ('pending_review', 'reviewed'));
ALTER TABLE documents ADD COLUMN medication_review_decisions TEXT DEFAULT '[]';
ALTER TABLE medications ADD COLUMN lifecycle_events TEXT DEFAULT '[]';
ALTER TABLE medications ADD COLUMN prescription_ids TEXT DEFAULT '[]';
UPDATE medications SET prescription_ids = json_array(document_id)
  WHERE document_id IS NOT NULL;
UPDATE medications SET lifecycle_events = json_array(
  json_object('event', 'started', 'date', start_date, 'document_id', document_id)
) WHERE is_deleted = 0 AND document_id IS NOT NULL;
UPDATE medications SET lifecycle_events = json_array(
  json_object('event', 'started', 'date', start_date)
) WHERE is_deleted = 0 AND document_id IS NULL;

-- 0008_culture_results
CREATE TABLE culture_results (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
  specimen_type TEXT NOT NULL CHECK (specimen_type IN ('blood','urine','sputum','other')),
  collection_date TEXT,
  result_status TEXT NOT NULL CHECK (result_status IN ('positive','negative','no_growth','contaminated')),
  organism TEXT,
  growth_quantity TEXT CHECK (growth_quantity IN ('light','moderate','heavy') OR growth_quantity IS NULL),
  sensitivities TEXT NOT NULL DEFAULT '[]',
  comments TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by TEXT REFERENCES users(id)
);
CREATE INDEX idx_culture_results_patient ON culture_results(patient_id);
CREATE INDEX idx_culture_results_document ON culture_results(document_id);

-- 0009_note_audio_fields
ALTER TABLE clinical_notes ADD COLUMN audio_r2_key TEXT;
ALTER TABLE clinical_notes ADD COLUMN audio_transcript TEXT;
ALTER TABLE clinical_notes ADD COLUMN audio_duration_sec INTEGER;

-- 0010_long_session_flag
ALTER TABLE refresh_tokens ADD COLUMN long_session INTEGER NOT NULL DEFAULT 0;

-- 0011_share_links
CREATE TABLE share_links (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  patient_ids TEXT NOT NULL DEFAULT '[]',
  scopes TEXT NOT NULL DEFAULT '["read"]',
  expires_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_share_links_token ON share_links(token_hash);
CREATE INDEX idx_share_links_creator ON share_links(created_by);

-- 0012_ai_provider_keys
CREATE TABLE ai_provider_keys (
  provider TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  model TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT NOT NULL REFERENCES users(id)
);

-- 0013_ai_use_case_routing
CREATE TABLE ai_use_case_routing (
  use_case TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT NOT NULL
);
INSERT INTO ai_use_case_routing VALUES ('doc_extract','google','gemini-2.5-flash',datetime('now'),'system');
INSERT INTO ai_use_case_routing VALUES ('vitals_parse','google','gemini-2.5-flash',datetime('now'),'system');
INSERT INTO ai_use_case_routing VALUES ('test_disambig','anthropic','claude-haiku-4-5-20251001',datetime('now'),'system');
INSERT INTO ai_use_case_routing VALUES ('ref_range','anthropic','claude-haiku-4-5-20251001',datetime('now'),'system');
INSERT INTO ai_use_case_routing VALUES ('voice_trans','deepgram','nova-3',datetime('now'),'system');

-- 0014_share_links_nullable_expiry
CREATE TABLE share_links_new (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  patient_ids TEXT NOT NULL DEFAULT '[]',
  scopes TEXT NOT NULL DEFAULT '["read"]',
  expires_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO share_links_new SELECT * FROM share_links;
DROP TABLE share_links;
ALTER TABLE share_links_new RENAME TO share_links;
CREATE INDEX idx_share_links_token ON share_links(token_hash);
CREATE INDEX idx_share_links_creator ON share_links(created_by);

-- 0015_share_links_store_link
ALTER TABLE share_links ADD COLUMN link TEXT;

-- 0016_personal_access_tokens
CREATE TABLE personal_access_tokens (
  id                          TEXT PRIMARY KEY,
  user_id                     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                        TEXT NOT NULL,
  token_hash                  TEXT NOT NULL UNIQUE,
  token_prefix                TEXT NOT NULL,
  token_suffix                TEXT NOT NULL,
  scopes                      TEXT NOT NULL DEFAULT 'read',
  target_platform             TEXT,
  pat_consent_acknowledged_at TEXT NOT NULL,
  last_used_at                TEXT,
  revoked_at                  TEXT,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at                  TEXT,
  UNIQUE(user_id, name)
);
CREATE INDEX idx_pat_user  ON personal_access_tokens(user_id);
CREATE INDEX idx_pat_hash  ON personal_access_tokens(token_hash);

-- 0017_external_api_access_log
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

-- 0018_write_confirmations
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

-- 0019_oauth
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
CREATE INDEX idx_oauth_refresh_user    ON oauth_refresh_tokens(user_id);
CREATE INDEX idx_oauth_refresh_client  ON oauth_refresh_tokens(client_id);
CREATE INDEX idx_oauth_refresh_expires ON oauth_refresh_tokens(expires_at);
ALTER TABLE personal_access_tokens ADD COLUMN client_id TEXT REFERENCES oauth_clients(id);
ALTER TABLE personal_access_tokens ADD COLUMN issued_via TEXT NOT NULL DEFAULT 'pat'
  CHECK (issued_via IN ('pat', 'oauth'));
CREATE INDEX idx_pat_client_id ON personal_access_tokens(client_id);
`;

// Cleared in reverse-dependency order on subsequent calls; schema is created on first call.
const CLEARABLE_TABLES = [
  "oauth_refresh_tokens",
  "write_confirmations",
  "external_api_access_log",
  "oauth_auth_codes",
  "personal_access_tokens",
  "disambiguation_log",
  "medication_schedules",
  "medications",
  "culture_results",
  "scan_findings",
  "vital_readings",
  "clinical_notes",
  "test_results",
  "test_definitions",
  "documents",
  "user_patient_access",
  "share_links",
  "ai_provider_keys",
  "ai_use_case_routing",
  "refresh_tokens",
  "patient",
  "oauth_clients",
  "system_settings",
  "purge_log",
  "users",
];

export async function setupDb(db: D1Database) {
  // Miniflare D1 silently swallows DDL errors (CREATE/DROP TABLE), so we can't
  // rely on schema-detection queries. Instead, always attempt DELETE on every
  // table (caught on first call when tables don't exist yet) then re-run
  // migrations (caught on subsequent calls when tables already exist).
  for (const t of CLEARABLE_TABLES) {
    try {
      await db.prepare(`DELETE FROM ${t}`).run();
    } catch {
      // first call: table doesn't exist yet
    }
  }
  const stmts = MIGRATIONS_SQL
    .split(";")
    .map((s) => s.replace(/--[^\n]*/g, "").trim())
    .filter((s) => s.length > 0);
  for (const stmt of stmts) {
    try {
      await db.prepare(stmt).run();
    } catch {
      // subsequent calls: DDL already applied (table/index already exists, etc.)
    }
  }
}

export async function seedAdmin(db: D1Database, overrides?: Partial<{ id: string; email: string; hash: string }>) {
  const id = overrides?.id ?? "admin-1";
  const email = overrides?.email ?? "admin@test.com";
  const hash = overrides?.hash ?? "fakehash";
  await db.prepare(
    "INSERT INTO users (id, email, password_hash, role, display_name, is_super_admin) VALUES (?, ?, ?, ?, ?, 1)"
  ).bind(id, email, hash, "admin", "Test Admin").run();
  return id;
}

export async function seedViewer(db: D1Database, overrides?: Partial<{ id: string; email: string }>) {
  const id = overrides?.id ?? "viewer-1";
  const email = overrides?.email ?? "viewer@test.com";
  await db.prepare(
    "INSERT INTO users (id, email, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)"
  ).bind(id, email, "fakehash", "viewer", "Test Viewer").run();
  return id;
}

export async function seedPatient(db: D1Database, createdBy = "admin-1") {
  const id = "patient-1";
  await db.prepare(
    "INSERT INTO patient (id, name, date_of_birth, gender, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, "Demo Patient", "1951-05-26", "female", createdBy, createdBy).run();
  await db.prepare(
    "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
  ).bind("access-1", createdBy, id, "admin", createdBy).run();
  return id;
}

export async function seedDocument(db: D1Database, overrides?: Partial<{
  id: string;
  patient_id: string;
  type: string;
  title: string;
  document_date: string;
  r2_key: string;
  mime_type: string;
  file_size_bytes: number;
  processing_status: string;
  is_deleted: number;
  sha256: string | null;
  uploaded_by: string;
}>) {
  const id = overrides?.id ?? "doc-1";
  const patient_id = overrides?.patient_id ?? "patient-1";
  const type = overrides?.type ?? "blood_report";
  const title = overrides?.title ?? "Blood Test Report";
  const document_date = overrides?.document_date ?? "2024-01-15";
  const r2_key = overrides?.r2_key ?? `patients/${patient_id}/documents/${id}/report.pdf`;
  const mime_type = overrides?.mime_type ?? "application/pdf";
  const file_size_bytes = overrides?.file_size_bytes ?? 12345;
  const processing_status = overrides?.processing_status ?? "complete";
  const is_deleted = overrides?.is_deleted ?? 0;
  const sha256 = overrides?.sha256 !== undefined ? overrides.sha256 : null;
  const uploaded_by = overrides?.uploaded_by ?? "admin-1";

  await db.prepare(
    `INSERT INTO documents (id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes, processing_status, is_deleted, sha256, uploaded_by, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes, processing_status, is_deleted, sha256, uploaded_by, uploaded_by, uploaded_by).run();

  return id;
}

export async function seedMedication(db: D1Database, overrides?: Partial<{
  id: string;
  patient_id: string;
  document_id: string | null;
  brand_name: string;
  dosage: string;
  form: string;
  start_date: string;
  is_active: number;
  prescription_ids: string;
  lifecycle_events: string;
}>) {
  const id = overrides?.id ?? "med-1";
  const patient_id = overrides?.patient_id ?? "patient-1";
  const document_id = overrides?.document_id ?? null;
  const brand_name = overrides?.brand_name ?? "Amlodipine";
  const dosage = overrides?.dosage ?? "5mg";
  const form = overrides?.form ?? "tablet";
  const start_date = overrides?.start_date ?? "2026-01-01";
  const is_active = overrides?.is_active ?? 1;
  const prescription_ids = overrides?.prescription_ids ?? "[]";
  const lifecycle_events = overrides?.lifecycle_events ?? "[]";

  await db.prepare(
    `INSERT INTO medications (id, patient_id, document_id, brand_name, dosage, form,
       start_date, is_active, prescription_ids, lifecycle_events,
       created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin-1', 'admin-1')`
  ).bind(id, patient_id, document_id, brand_name, dosage, form,
    start_date, is_active, prescription_ids, lifecycle_events).run();

  return id;
}

export async function seedPat(db: D1Database, overrides?: Partial<{
  id: string; user_id: string; name: string;
  token_hash: string; token_prefix: string; token_suffix: string;
  scopes: string; target_platform: string;
  pat_consent_acknowledged_at: string;
  revoked_at: string | null; expires_at: string | null;
  issued_via: string; client_id: string | null;
}>) {
  const id = overrides?.id ?? "pat-1";
  const user_id = overrides?.user_id ?? "admin-1";
  const name = overrides?.name ?? "Test Token";
  const token_hash = overrides?.token_hash ?? "fakehash123";
  const token_prefix = overrides?.token_prefix ?? "mcp_aaaaaa";
  const token_suffix = overrides?.token_suffix ?? "abc";
  const scopes = overrides?.scopes ?? "read";
  const target_platform = overrides?.target_platform ?? "anthropic";
  const pat_consent_acknowledged_at = overrides?.pat_consent_acknowledged_at ?? new Date().toISOString();
  const revoked_at = overrides?.revoked_at ?? null;
  const expires_at = overrides?.expires_at ?? null;
  const issued_via = overrides?.issued_via ?? "pat";
  const client_id = overrides?.client_id ?? null;
  await db.prepare(
    `INSERT INTO personal_access_tokens
      (id, user_id, name, token_hash, token_prefix, token_suffix, scopes, target_platform, pat_consent_acknowledged_at, revoked_at, expires_at, issued_via, client_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, user_id, name, token_hash, token_prefix, token_suffix, scopes, target_platform, pat_consent_acknowledged_at, revoked_at, expires_at, issued_via, client_id).run();
  return id;
}

export async function seedOAuthClient(db: D1Database, overrides?: Partial<{
  id: string;
  client_name: string;
  redirect_uris: string;
  scope: string;
}>) {
  const id = overrides?.id ?? "client-1";
  const client_name = overrides?.client_name ?? "Test Client";
  const redirect_uris = overrides?.redirect_uris ?? '["https://example.com/cb"]';
  const scope = overrides?.scope ?? "mcp.read";
  await db.prepare(
    `INSERT INTO oauth_clients (id, client_name, redirect_uris, scope)
     VALUES (?, ?, ?, ?)`
  ).bind(id, client_name, redirect_uris, scope).run();
  return id;
}
