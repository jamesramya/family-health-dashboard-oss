// worker/src/services/extractor.ts
//
// TypeScript replacement for the Python/Pyodide extractor Worker.
// Called directly from DocumentExtractionWorkflow — no HTTP hop, no Pyodide overhead.
//
// Public API:
//   classify(fileBytes, mimeType, env)       → doc type string
//   extractDocument(fileBytes, docType, mimeType, patient, env) → ExtractionResult

import type { Bindings } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface Patient {
  name: string | null;
  date_of_birth: string | null;
  gender: string | null;
}

export interface BloodTest {
  raw_name?: string;
  canonical_name?: string;
  key?: string;
  value?: number;
  unit?: string;
  ref_low?: number | null;
  ref_high?: number | null;
  ref_source?: string;
  flag?: string;
  category?: string;
  date?: string;
  source_lab?: string;
}

export interface ScanFinding {
  scan_type?: string;
  body_area?: string;
  findings_summary?: string;
  impression?: string;
  ordering_doctor?: string;
  scan_date?: string;
}

export interface MedicationSchedule {
  time_of_day?: string;
  meal_relation?: string;
  dose_quantity?: number;
  specific_time?: string;
  instructions?: string;
}

export interface Medication {
  brand_name?: string;
  name?: string;
  generic_name?: string;
  dosage?: string;
  form?: string;
  prescribing_doctor?: string;
  start_date?: string;
  end_date?: string;
  reason?: string;
  notes?: string;
  schedule?: MedicationSchedule[];
}

export interface ClinicalNote {
  visit_date?: string;
  doctor_name?: string;
  facility?: string;
  diagnosis?: string;
  summary?: string;
  treatment_plan?: string;
}

export interface CultureReportExtraction {
  specimen_type: "blood" | "urine" | "sputum" | "other";
  collection_date: string | null;
  result_status: "positive" | "negative" | "no_growth" | "contaminated";
  organism: string | null;
  growth_quantity: "light" | "moderate" | "heavy" | null;
  sensitivities: Array<{ antibiotic: string; result: "S" | "I" | "R" }>;
  comments: string | null;
}

export interface ExtractionResult {
  _classified_type?: string;
  report_date?: string;
  lab_name?: string;
  source?: string;
  tests?: BloodTest[];
  findings?: ScanFinding[];
  medications?: Medication[];
  notes?: ClinicalNote[];
  culture?: CultureReportExtraction;
}

interface GeminiContent {
  role: "user" | "model";
  parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }>;
}

// ---------------------------------------------------------------------------
// Prompt templates (ported from extractor/src/prompts/*.txt)
// ---------------------------------------------------------------------------
export const PROMPT_BLOOD_REPORT = `You are a medical lab data extraction assistant.

Patient demographics: {gender}, age {age} years ({dob_str}).

Extract ALL test results from this lab report. Return ONLY valid JSON with no preamble or trailing text.

For each test:
1. canonical_name: Standard medical English in Title Case with spaces
   (e.g. "Haemoglobin", "Platelet Count").
   - NEVER snake_case (no "haemoglobin", no "platelet_count").
   - NEVER use abbreviations (no "MCV", "MCH", "MCHC", "MPV", "RDW", "TLC", "ALT", "AST", "CRP", "ESR", "RBC", "WBC", "HCT"). Always use the full name.
   - NEVER append specimen suffixes like ", Serum", ", Plasma", or ", Whole Blood".
2. key: lowercase_with_underscores (e.g. "haemoglobin").
3. category: one of haematology | electrolytes | liver_function | renal_function |
   bone_profile | coagulation | drug_levels | inflammatory | thyroid_function |
   blood_glucose | lipid_profile | other
4. ref_low / ref_high: Use the lab's printed range if clinically plausible for this
   patient's age/sex. If absent or inappropriate, substitute the standard clinical range
   and set ref_source="clinical". Otherwise set ref_source="lab".

Return:
{
  "report_date": "YYYY-MM-DD",
  "lab_name": "string",
  "tests": [
    {
      "raw_name": "exact name as printed",
      "canonical_name": "standardised name",
      "key": "key_slug",
      "value": numeric_value,
      "unit": "unit string",
      "ref_low": numeric_or_null,
      "ref_high": numeric_or_null,
      "ref_source": "lab or clinical",
      "flag": "HIGH | LOW | NORMAL",
      "category": "from list above"
    }
  ]
}

Rules:
- value must be numeric. Omit non-numeric results entirely.
- unit must always be a string. For unitless tests (e.g. INR, ratios, indices), use "".
- Never infer values not in the report.
- report_date must be YYYY-MM-DD.
- flag must reflect the ref range you are using, not just the lab's printed flag.
- Differential count (Neutrophils, Lymphocytes, Monocytes, Eosinophils, Basophils):
  if both a relative (%) and an absolute value are printed, create TWO separate entries:
  * Relative entry:  key = e.g. "neutrophils", unit = "%"
  * Absolute entry:  key = e.g. "neutrophils_absolute", unit = "x10^9/L",
    canonical_name = "Neutrophils Absolute Count"
  Use independent ref range / flag logic for each entry.
- If a test appears multiple times, include it once only.
- Do not include header rows or non-result lines.`;

const PROMPT_SCAN = `You are a medical imaging report extraction assistant.

Patient demographics: {gender}, age {age} years ({dob_str}).

Extract all imaging findings from this radiology or scan report.
Return ONLY valid JSON with no preamble or trailing text.

Return:
{
  "findings": [
    {
      "scan_type": "xray | ct | mri | ultrasound | ecg | other",
      "body_area": "body region examined (e.g. 'chest', 'abdomen', 'left knee')",
      "findings_summary": "verbatim or close paraphrase of the findings section",
      "impression": "verbatim or close paraphrase of the impression/conclusion section, or null",
      "ordering_doctor": "referring or ordering clinician name, or null",
      "scan_date": "YYYY-MM-DD, or null if not stated"
    }
  ]
}

Rules:
- scan_type must be one of: xray, ct, mri, ultrasound, ecg, other.
- body_area must be a non-empty string.
- findings_summary must be a non-empty string.
- If there are multiple separate studies in the same document, create one entry per study.
- If scan_date is not clearly stated, set it to null — never guess.
- Do not add information not present in the document.
- ordering_doctor: strip any titles (Dr., Prof., Mr., Ms., etc.) — return the name only in Title Case (e.g. "Ramesh Kumar", not "Dr. ramesh kumar").`;

const PROMPT_PRESCRIPTION = `You are a medication prescription extraction assistant.

Patient demographics: {gender}, age {age} years ({dob_str}).

Extract all medications from this prescription. Return ONLY valid JSON with no preamble.

Return:
{
  "medications": [
    {
      "brand_name": "brand or trade name as written",
      "generic_name": "INN / generic name, or null if not stated",
      "dosage": "dose per administration (e.g. '500mg', '10ml')",
      "form": "tablet | capsule | syrup | injection | cream | drops | inhaler | other",
      "prescribing_doctor": "doctor name, or null",
      "start_date": "YYYY-MM-DD, or null if not stated",
      "end_date": "YYYY-MM-DD, or null if not stated",
      "reason": "condition / indication, or null",
      "notes": "any additional instructions not captured elsewhere, or null",
      "schedule": [
        {
          "time_of_day": "morning | afternoon | evening | night | bedtime | as_needed",
          "meal_relation": "before_meal | after_meal | with_meal | empty_stomach | not_applicable",
          "dose_quantity": 1,
          "specific_time": "HH:MM in 24h format, or null",
          "instructions": "free-text instruction for this dose, or null"
        }
      ]
    }
  ]
}

Rules:
- form must be one of: tablet, capsule, syrup, injection, cream, drops, inhaler, other.
- time_of_day must be one of: morning, afternoon, evening, night, bedtime, as_needed.
- meal_relation must be one of: before_meal, after_meal, with_meal, empty_stomach, not_applicable.
- dose_quantity must be a positive number.
- If no schedule is stated, use time_of_day="as_needed" and meal_relation="not_applicable".
- Do not invent information not present in the prescription.
- If a medication appears on multiple lines, merge into one entry.
- prescribing_doctor: strip any titles (Dr., Prof., Mr., Ms., etc.) — return the name only in Title Case (e.g. "Ramesh Kumar", not "Dr. ramesh kumar").`;

const PROMPT_CONSULTATION = `You are a clinical consultation note extraction assistant.

Patient demographics: {gender}, age {age} years ({dob_str}).

Extract all clinical note information from this consultation document.
Return ONLY valid JSON with no preamble or trailing text.

Return:
{
  "notes": [
    {
      "visit_date": "YYYY-MM-DD",
      "doctor_name": "consulting doctor full name, or null",
      "facility": "clinic / hospital name, or null",
      "diagnosis": "primary diagnosis or diagnoses (free text), or null",
      "summary": "summary of presenting complaints and clinical findings (required)",
      "treatment_plan": "plan, follow-up instructions, referrals (free text), or null"
    }
  ]
}

Rules:
- visit_date must be YYYY-MM-DD. If absent, use today's date as a fallback only.
- summary is required and must be a non-empty string.
- If there are multiple separate visits, create one entry per visit.
- Do not add any clinical interpretation beyond what is stated.
- Do not include billing codes, patient IDs, or administrative fields.
- doctor_name: strip any titles (Dr., Prof., Mr., Ms., etc.) — return the name only in Title Case (e.g. "Ramesh Kumar", not "Dr. ramesh kumar").
- facility: return in Title Case (e.g. "Apollo Hospital", not "apollo hospital").`;

export const PROMPT_CULTURE = `You are a medical lab data extraction assistant specialising in microbiology culture reports.
Extract all culture result information from this document.
Return ONLY valid JSON with no preamble or trailing text.

Return exactly this structure:
{
  "culture": {
    "specimen_type": "blood" | "urine" | "sputum" | "other",
    "collection_date": "YYYY-MM-DD or null",
    "result_status": "positive" | "negative" | "no_growth" | "contaminated",
    "organism": "organism name in standard scientific binomial notation, or null",
    "growth_quantity": "light" | "moderate" | "heavy" | null,
    "sensitivities": [
      { "antibiotic": "antibiotic name", "result": "S" | "I" | "R" }
    ],
    "comments": "full interpretive paragraph from the lab verbatim, or null"
  }
}

Rules:
- If result_status is "negative" or "no_growth": set organism, growth_quantity to null; set sensitivities to [].
- If result_status is "contaminated": set sensitivities to []; organism may be present.
- sensitivities: include every antibiotic row in the sensitivity panel. Use "S" (Susceptible), "I" (Intermediate), "R" (Resistant).
- comments: extract the lab's interpretive narrative verbatim. Omit column headers and boilerplate footers.
- collection_date: use the specimen collection date if present, otherwise the report date.
- Do not invent data. If a field is absent from the report, return null.`;

const PROMPT_CLASSIFY = `Look at this medical document and classify it.
Reply with ONLY one of these exact words, nothing else:
blood_report
scan
ecg
prescription
consultation
culture_report
other

Definitions:
blood_report - lab results with numeric test values (haematology, biochemistry, lipids, etc.)
scan - radiology or imaging report (X-ray, CT, MRI, ultrasound, PET)
ecg - electrocardiogram report
prescription - list of medications prescribed to the patient
consultation - doctor notes, discharge summary, outpatient or clinic letter
culture_report - microbiological culture result identifying organisms from a specimen (blood, urine, sputum) with antibiotic sensitivity panel
other - anything that does not fit the above`;

// ---------------------------------------------------------------------------
// Prompt map
// ---------------------------------------------------------------------------
const PROMPT_MAP: Record<string, string> = {
  blood_report: PROMPT_BLOOD_REPORT,
  scan: PROMPT_SCAN,
  ecg: PROMPT_SCAN,
  prescription: PROMPT_PRESCRIPTION,
  consultation: PROMPT_CONSULTATION,
  culture_report: PROMPT_CULTURE,
  other: PROMPT_CONSULTATION,
};

const VALID_DOC_TYPES = new Set([
  "blood_report", "scan", "ecg", "prescription", "consultation", "culture_report", "other",
]);

// ---------------------------------------------------------------------------
// Age helper
// ---------------------------------------------------------------------------
function computeAge(dobStr: string | null): number | null {
  if (!dobStr) return null;
  try {
    const born = new Date(dobStr);
    const today = new Date();
    let age = today.getFullYear() - born.getFullYear();
    const m = today.getMonth() - born.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < born.getDate())) age--;
    return age;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// LLM call helpers (Gemini primary, GPT fallback)
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

function encodeFileBase64(fileBytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < fileBytes.length; i += CHUNK) {
    binary += String.fromCharCode(...fileBytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function callGemini(
  prompt: string,
  fileBytes: Uint8Array | null,
  mimeType: string | null,
  history: GeminiContent[],
  env: Bindings,
): Promise<string> {
  const apiKey = env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY not set");

  const parts: GeminiContent["parts"] = [];
  if (fileBytes && mimeType) {
    parts.push({ inline_data: { mime_type: mimeType, data: encodeFileBase64(fileBytes) } });
  }
  parts.push({ text: prompt });

  const contents: GeminiContent[] = [
    ...history,
    { role: "user", parts },
  ];

  const body = JSON.stringify({
    contents,
    generationConfig: { temperature: 0 },
  });

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }

    const res = await fetch(
      `${env.AI_GATEWAY_URL}/google-ai-studio/v1/models/gemini-2.5-flash:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body,
      },
    );

    const text = await res.text();

    if (res.status >= 500) {
      lastError = new Error(`Gemini API error ${res.status}: ${text.slice(0, 300)}`);
      continue; // retry on 5xx
    }
    if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 300)}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = JSON.parse(text) as any;
    const raw: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error(`Unexpected Gemini response shape: ${text.slice(0, 300)}`);
    return raw;
  }

  throw lastError ?? new Error("Gemini: max retries exceeded");
}

async function callGpt(
  prompt: string,
  fileBytes: Uint8Array | null,
  mimeType: string | null,
  history: GeminiContent[],
  env: Bindings,
): Promise<string> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  // Build OpenAI-format messages from Gemini history + current prompt
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: Array<{ role: string; content: any }> = [];

  for (const entry of history) {
    const role = entry.role === "model" ? "assistant" : "user";
    const textParts = entry.parts.filter((p) => "text" in p).map((p) => (p as { text: string }).text);
    if (textParts.length > 0) {
      messages.push({ role, content: textParts.join("\n") });
    }
  }

  // Current prompt + optional image
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];
  if (fileBytes && mimeType) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${mimeType};base64,${encodeFileBase64(fileBytes)}` },
    });
  }
  content.push({ type: "text", text: prompt });
  messages.push({ role: "user", content });

  const res = await fetch(
    `${env.AI_GATEWAY_URL}/openai/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages,
        temperature: 0,
      }),
    },
  );

  const text = await res.text();
  if (!res.ok) throw new Error(`GPT API error ${res.status}: ${text.slice(0, 300)}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = JSON.parse(text) as any;
  const raw: string | undefined = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error(`Unexpected GPT response shape: ${text.slice(0, 300)}`);
  return raw;
}

/**
 * Try Gemini first; if it fails and OPENAI_API_KEY is configured, fall back to GPT.
 */
async function callLLM(
  prompt: string,
  fileBytes: Uint8Array | null,
  mimeType: string | null,
  history: GeminiContent[],
  env: Bindings,
): Promise<string> {
  try {
    return await callGemini(prompt, fileBytes, mimeType, history, env);
  } catch (geminiErr) {
    if (!env.OPENAI_API_KEY) throw geminiErr;
    console.log(`Gemini failed (${(geminiErr as Error).message}), falling back to GPT`);
    return callGpt(prompt, fileBytes, mimeType, history, env);
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------
function buildPrompt(docType: string, patient: Patient): string {
  const template = PROMPT_MAP[docType] ?? PROMPT_CONSULTATION;
  const gender = patient.gender ?? "unknown gender";
  const age = computeAge(patient.date_of_birth);
  const ageStr = age != null ? String(age) : "unknown";
  const dobStr = patient.date_of_birth ? `DOB: ${patient.date_of_birth}` : "DOB unknown";
  return template
    .replace("{gender}", gender)
    .replace("{age}", ageStr)
    .replace("{dob_str}", dobStr);
}

// ---------------------------------------------------------------------------
// JSON parser (tolerates preamble/postamble text around the JSON object)
// ---------------------------------------------------------------------------
function parseJson(raw: string): Record<string, unknown> {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const result = JSON.parse(raw.slice(start, end + 1));
      if (result && typeof result === "object") return result as Record<string, unknown>;
    } catch {
      // fall through to error
    }
  }
  throw new Error(`LLM returned non-JSON. First 300 chars: ${raw.slice(0, 300)}`);
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------
const VALID_FLAGS = new Set(["HIGH", "LOW", "NORMAL"]);
const VALID_CATEGORIES = new Set([
  "haematology", "electrolytes", "liver_function", "renal_function",
  "bone_profile", "coagulation", "drug_levels", "inflammatory",
  "thyroid_function", "blood_glucose", "lipid_profile", "other",
]);
const VALID_SCAN_TYPES = new Set(["xray", "ct", "mri", "ultrasound", "ecg", "other"]);
const VALID_MED_FORMS = new Set([
  "tablet", "capsule", "syrup", "injection", "cream", "drops", "inhaler", "other",
]);
const VALID_TIMES_OF_DAY = new Set([
  "morning", "afternoon", "evening", "night", "bedtime", "as_needed",
]);
const VALID_MEAL_RELATIONS = new Set([
  "before_meal", "after_meal", "with_meal", "empty_stomach", "not_applicable",
]);

function validateBloodTests(data: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const dateStr = (data.report_date as string | undefined) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    errors.push(`report_date: expected YYYY-MM-DD, got ${JSON.stringify(dateStr)}`);
  }
  const tests = (data.tests as unknown[]) ?? [];
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i] as Record<string, unknown>;
    const name = ((t.canonical_name ?? t.raw_name ?? "?") as string);
    const prefix = `tests[${i}] (${name})`;
    if (typeof t.unit !== "string") errors.push(`${prefix}.unit: missing or not a string`);
    for (const field of ["ref_low", "ref_high"] as const) {
      const v = t[field];
      if (v != null && typeof v !== "number") {
        errors.push(`${prefix}.${field}: expected number or null, got ${JSON.stringify(v)}`);
      }
    }
    if (!VALID_FLAGS.has(t.flag as string)) {
      errors.push(`${prefix}.flag: expected HIGH/LOW/NORMAL, got ${JSON.stringify(t.flag)}`);
    }
    if (!VALID_CATEGORIES.has(t.category as string)) {
      errors.push(`${prefix}.category: invalid value ${JSON.stringify(t.category)}`);
    }
    if (!["lab", "clinical"].includes(t.ref_source as string)) {
      errors.push(`${prefix}.ref_source: expected 'lab' or 'clinical', got ${JSON.stringify(t.ref_source)}`);
    }
  }
  return errors;
}

function validateFindings(data: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const findings = (data.findings as unknown[]) ?? [];
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i] as Record<string, unknown>;
    const prefix = `findings[${i}]`;
    if (!f.findings_summary) errors.push(`${prefix}.findings_summary: required`);
    if (!VALID_SCAN_TYPES.has(f.scan_type as string)) {
      errors.push(`${prefix}.scan_type: invalid value ${JSON.stringify(f.scan_type)}`);
    }
  }
  return errors;
}

function validateMedications(data: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const meds = (data.medications as unknown[]) ?? [];
  for (let i = 0; i < meds.length; i++) {
    const m = meds[i] as Record<string, unknown>;
    const prefix = `medications[${i}]`;
    if (!m.brand_name && !m.name) errors.push(`${prefix}.brand_name: required`);
    if (!VALID_MED_FORMS.has(m.form as string)) {
      errors.push(`${prefix}.form: invalid value ${JSON.stringify(m.form)}`);
    }
    const schedule = (m.schedule as unknown[]) ?? [];
    for (let j = 0; j < schedule.length; j++) {
      const s = schedule[j] as Record<string, unknown>;
      const sp = `${prefix}.schedule[${j}]`;
      if (!VALID_TIMES_OF_DAY.has(s.time_of_day as string)) {
        errors.push(`${sp}.time_of_day: invalid value ${JSON.stringify(s.time_of_day)}`);
      }
      if (!VALID_MEAL_RELATIONS.has(s.meal_relation as string)) {
        errors.push(`${sp}.meal_relation: invalid value ${JSON.stringify(s.meal_relation)}`);
      }
    }
  }
  return errors;
}

function validateNotes(data: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const notes = (data.notes as unknown[]) ?? [];
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i] as Record<string, unknown>;
    const prefix = `notes[${i}]`;
    if (!n.summary) errors.push(`${prefix}.summary: required`);
    const dateStr = (n.visit_date as string | undefined) ?? "";
    if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      errors.push(`${prefix}.visit_date: expected YYYY-MM-DD, got ${JSON.stringify(dateStr)}`);
    }
  }
  return errors;
}

function validateCulture(data: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const culture = (data["culture"] as Record<string, unknown>) ?? {};
  const validSpecimen = ["blood", "urine", "sputum", "other"];
  const validStatus = ["positive", "negative", "no_growth", "contaminated"];
  if (!validSpecimen.includes(culture["specimen_type"] as string)) {
    errors.push(`specimen_type must be one of: ${validSpecimen.join(", ")}`);
  }
  if (!validStatus.includes(culture["result_status"] as string)) {
    errors.push(`result_status must be one of: ${validStatus.join(", ")}`);
  }
  return errors;
}

function validate(docType: string, data: Record<string, unknown>): string[] {
  if (docType === "blood_report") return validateBloodTests(data);
  if (docType === "scan" || docType === "ecg") return validateFindings(data);
  if (docType === "prescription") return validateMedications(data);
  if (docType === "culture_report") return validateCulture(data);
  return validateNotes(data);
}

function postProcessBlood(data: Record<string, unknown>): Record<string, unknown> {
  const tests = ((data.tests as unknown[]) ?? []).filter((t) => {
    const test = t as Record<string, unknown>;
    return typeof test.value === "number" && !isNaN(test.value as number);
  });
  const labName = (data.lab_name as string) ?? "";
  const source =
    labName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
    "unknown-lab";
  return { ...data, tests, source };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

const REQUIRED_SECRETS: Array<keyof Bindings> = ["GOOGLE_API_KEY", "AI_GATEWAY_URL"];

function assertExtractorEnv(env: Bindings): void {
  const missing = REQUIRED_SECRETS.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(`Extractor misconfigured — missing secrets: ${missing.join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a document by asking Gemini what type it is.
 * Returns one of: blood_report | scan | ecg | prescription | consultation | other
 * Falls back to "other" if classification fails.
 */
export async function classify(
  fileBytes: Uint8Array,
  mimeType: string,
  env: Bindings,
): Promise<string> {
  assertExtractorEnv(env);
  try {
    const raw = await callLLM(PROMPT_CLASSIFY, fileBytes, mimeType, [], env);
    const classified = raw.trim().toLowerCase().split(/\s/)[0] ?? "other";
    return VALID_DOC_TYPES.has(classified) ? classified : "other";
  } catch {
    return "other";
  }
}

/**
 * Extract structured medical data from a document.
 *
 * If docType is "other", auto-classifies first.
 * Performs one validation-retry cycle before throwing on persistent errors.
 * Sets result._classified_type when the type was auto-classified.
 */
export async function extractDocument(
  fileBytes: Uint8Array,
  docType: string,
  mimeType: string,
  patient: Patient,
  env: Bindings,
): Promise<ExtractionResult> {
  assertExtractorEnv(env);
  // Auto-classify if type is "other"
  let effectiveType = VALID_DOC_TYPES.has(docType) ? docType : "other";
  if (effectiveType === "other") {
    effectiveType = await classify(fileBytes, mimeType, env);
  }

  const prompt = buildPrompt(effectiveType, patient);
  const rawText = await callLLM(prompt, fileBytes, mimeType, [], env);
  let data = parseJson(rawText);

  if (effectiveType === "blood_report") data = postProcessBlood(data);

  const errors = validate(effectiveType, data);
  if (errors.length > 0) {
    // Retry with conversation history so the model has full context for correction
    const history: GeminiContent[] = [
      { role: "user", parts: [{ text: prompt }] },
      { role: "model", parts: [{ text: rawText }] },
    ];
    const retryPrompt = [
      "The previous extraction had these validation errors:",
      errors.map((e) => `- ${e}`).join("\n"),
      "",
      `Your previous output was:\n${JSON.stringify(data)}`,
      "",
      "Return corrected JSON only, fixing the issues above. Do not change correct values.",
    ].join("\n");

    const retryText = await callLLM(retryPrompt, null, null, history, env);
    data = parseJson(retryText);
    if (effectiveType === "blood_report") data = postProcessBlood(data);

    const retryErrors = validate(effectiveType, data);
    if (retryErrors.length > 0) {
      throw new Error(
        `Extraction failed validation after retry (${retryErrors.length} errors):\n` +
          retryErrors.join("\n"),
      );
    }
  }

  const result = data as ExtractionResult;
  if (effectiveType !== docType) result._classified_type = effectiveType;
  return result;
}
