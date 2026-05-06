// ============================================================
// Core domain types matching D1 schema
// ============================================================

export type UserRole = "admin" | "viewer";

export interface User {
  id: string;
  email: string;
  role: UserRole;
  display_name: string;
  // D1 returns INTEGER 0/1 for boolean columns; use !!field when treating as boolean
  is_super_admin: number;
  must_change_pw: number;
}

export interface Patient {
  id: string;
  name: string;
  date_of_birth: string; // ISO date
  gender: string; // NOT NULL in schema
  blood_type: string | null;
  allergies: string[] | null;
  photo_r2_key: string | null;
}

export type DocumentType =
  | "blood_report"
  | "scan"
  | "ecg"
  | "prescription"
  | "consultation"
  | "culture_report"
  | "other";

export type ProcessingStatus =
  | "pending"
  | "processing"
  | "complete"
  | "failed";

export interface Document {
  id: string;
  patient_id: string;
  type: DocumentType;
  title: string;
  document_date: string; // ISO date
  r2_key: string;
  mime_type: string;
  file_size_bytes: number;
  source_lab: string | null;
  processing_status: ProcessingStatus;
  workflow_instance_id: string | null;
  medication_review_status: "pending_review" | "reviewed" | null;
  medication_review_decisions: MedicationReviewDecision[];
  llm_raw_response: Record<string, unknown> | null;
}

export type TestCategory =
  | "haematology"
  | "electrolytes"
  | "liver_function"
  | "renal_function"
  | "bone_profile"
  | "coagulation"
  | "drug_levels"
  | "inflammatory"
  | "thyroid_function"
  | "blood_glucose"
  | "lipid_profile"
  | "other";

export type TestFlag = "HIGH" | "LOW" | "NORMAL";

export interface TestDefinition {
  id: string;
  canonical_name: string;
  label: string;
  unit: string | null;
  category: TestCategory;
  ref_low: number | null;
  ref_high: number | null;
  sort_order: number;
  aliases: string[] | null;
}

export interface TestResult {
  id: string;
  patient_id: string;
  test_def_id: string;
  document_id: string | null;
  date: string; // ISO date
  value: number | null;
  value_text: string | null;
  flag: TestFlag | null;
  source_lab: string | null;
  report_file: string | null;
  ref_low_at_test?: number | null;
  ref_high_at_test?: number | null;
}

export type VitalType =
  | "bp"
  | "glucose"
  | "weight"
  | "heart_rate"
  | "spo2"
  | "temperature";

export type VitalSource = "manual" | "csv_import" | "device_sync";

export interface VitalReading {
  id: string;
  patient_id: string;
  type: VitalType;
  measured_at: string; // ISO datetime
  value_primary: number;
  value_secondary: number | null;
  value_tertiary: number | null;
  unit: string;
  context: string | null;
  notes: string | null;
  source: VitalSource;
}

export type MedicationForm =
  | "tablet"
  | "capsule"
  | "syrup"
  | "injection"
  | "cream"
  | "drops"
  | "inhaler"
  | "other";

export interface LifecycleEvent {
  event: "started" | "stopped" | "restarted" | "dosage_changed";
  date: string;
  note?: string;
  document_id?: string;
  old_value?: string;
  new_value?: string;
}

export interface MedicationReviewDecision {
  brand_name: string;
  dosage: string;
  decision: "added" | "skipped";
  extraction_index: number;
  medication_id?: string;
  reason?: string;
}

export interface Medication {
  id: string;
  patient_id: string;
  brand_name: string;
  generic_name: string | null;
  dosage: string; // NOT NULL in schema
  form: MedicationForm; // NOT NULL in schema
  start_date: string; // NOT NULL in schema — ISO date
  end_date: string | null; // ISO date
  reason: string | null;
  // D1 returns INTEGER 0/1; use !!is_active when treating as boolean
  is_active: number; // NOT NULL in schema
  notes: string | null;
  lifecycle_events: LifecycleEvent[];
  prescription_ids: string[];
}

export type MealRelation =
  | "before_meal"
  | "after_meal"
  | "with_meal"
  | "empty_stomach"
  | "not_applicable";

export interface MedicationSchedule {
  id: string;
  medication_id: string;
  time_of_day: string; // e.g. "morning", "evening"
  meal_relation: MealRelation; // NOT NULL in schema
  dose_quantity: string; // free text — was: number
  specific_time: string | null; // HH:MM
  instructions: string | null;
  days_of_week: string | null; // new
}

export interface ScanFinding {
  id: string;
  document_id: string; // NOT NULL in schema
  patient_id: string;
  scan_type: string;
  body_area: string; // NOT NULL in schema
  findings_summary: string; // NOT NULL in schema
  impression: string | null;
  ordering_doctor: string | null;
  scan_date: string; // NOT NULL in schema — ISO date
}

export interface AntibioticSensitivity {
  antibiotic: string;
  result: "S" | "I" | "R";
}

export interface CultureResult {
  id: string;
  document_id: string;
  patient_id: string;
  specimen_type: "blood" | "urine" | "sputum" | "other";
  collection_date: string | null;
  result_status: "positive" | "negative" | "no_growth" | "contaminated";
  organism: string | null;
  growth_quantity: "light" | "moderate" | "heavy" | null;
  sensitivities: AntibioticSensitivity[];
  comments: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClinicalNote {
  id: string;
  patient_id: string;
  document_id: string | null;
  visit_date: string; // NOT NULL in schema — ISO date
  doctor_name: string | null;
  facility: string | null;
  diagnosis: string | null;
  summary: string; // NOT NULL in schema
  treatment_plan: string | null;
  audio_r2_key?: string | null;
  audio_transcript?: string | null;
  audio_duration_sec?: number | null;
}

// ============================================================
// Dashboard / summary types
// ============================================================

// Matches the /alerts endpoint: SELECT tr.id, tr.test_def_id, tr.date, tr.value,
// tr.value_text, tr.flag, tr.source_lab, td.label, td.unit, td.category
export interface BloodWorkAlert {
  id: string;
  test_def_id: string;
  date: string;
  value: number | null;
  value_text: string | null;
  flag: TestFlag; // only HIGH/LOW are returned by the query
  source_lab: string | null;
  ref_low_at_test?: number | null;
  ref_high_at_test?: number | null;
  label: string;
  unit: string | null;
  category: TestCategory;
}

export interface BloodWorkCategoryItem {
  id: string;
  canonical_name: string;
  label: string;
  unit: string | null;
  category: TestCategory;
  ref_low: number | null;
  ref_high: number | null;
  sort_order: number;
  readings: TestResult[];
}

export interface BloodWorkCategory {
  category: TestCategory;
  tests: BloodWorkCategoryItem[];
}

export interface DashboardSummary {
  patient: Patient;
  blood_work_alerts: BloodWorkAlert[];
  active_medications_count: number;
  latest_vitals: VitalReading[];
  recent_documents: Document[];
  pending_prescription_reviews: number;
  last_activity: string | null;
}

// ============================================================
// Request / response envelope types
// ============================================================

export interface LoginRequest {
  email: string;
  password: string;
  turnstileToken: string;
}

export interface SetupRequest {
  email: string;
  password: string;
  display_name: string;
  turnstileToken: string;
}

export interface SetupResponse {
  user: User;
  api_key: string;
}

export interface AuthMeResponse {
  user: User;
}

export interface LoginResponse {
  // Backend only returns { id, email, role, display_name } on login (no is_super_admin/must_change_pw in user object)
  user: Pick<User, "id" | "email" | "role" | "display_name">;
  // Backend normalizes with !!user.must_change_pw so this IS a boolean
  must_change_pw: boolean;
}

export interface VitalParseRequest {
  text: string; // backend reads "text" (not "raw_text")
  api_key?: string;
}

export interface ChangePasswordRequest {
  old_password: string;
  new_password: string;
}
