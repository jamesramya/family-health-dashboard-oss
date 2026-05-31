import { Hono } from "hono";
import type { Bindings } from "../types";

type Variables = {
  user: { sub: string; role: string; email: string };
};

export const accountRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const MAX_EXPORT_BYTES = 10 * 1024 * 1024; // 10 MB estimate threshold
const BYTES_PER_ROW_ESTIMATE = 2048;

// GET /api/account/export — authenticated; returns a JSON bundle of all user data
accountRoutes.get("/export", async (c) => {
  const user = c.get("user");

  // Determine if super admin (sees all patients)
  const superAdminRow = await c.env.DB.prepare(
    "SELECT is_super_admin FROM users WHERE id = ?"
  ).bind(user.sub).first<{ is_super_admin: number }>();
  const isSuperAdmin = Boolean(superAdminRow?.is_super_admin);

  // Get list of patient IDs accessible to this user
  let patientIds: string[];
  if (isSuperAdmin) {
    const rows = await c.env.DB.prepare(
      "SELECT id FROM patient WHERE is_deleted = 0"
    ).all<{ id: string }>();
    patientIds = rows.results.map((r) => r.id);
  } else {
    const rows = await c.env.DB.prepare(
      "SELECT patient_id FROM user_patient_access WHERE user_id = ?"
    ).bind(user.sub).all<{ patient_id: string }>();
    patientIds = rows.results.map((r) => r.patient_id);
  }

  if (patientIds.length === 0) {
    // Still export an empty bundle
    const bundle = {
      manifest: {
        exported_at: new Date().toISOString(),
        user_id: user.sub,
        patient_count: 0,
        version: "1",
      },
      patients: [],
    };
    const date = new Date().toISOString().slice(0, 10);
    return c.body(JSON.stringify(bundle), 200, {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="family-health-export-${date}.json"`,
    });
  }

  // Row count estimate to guard against huge exports
  const placeholders = patientIds.map(() => "?").join(",");
  const counts = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM test_results WHERE patient_id IN (${placeholders}) AND is_deleted = 0`).bind(...patientIds).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM vital_readings WHERE patient_id IN (${placeholders}) AND is_deleted = 0`).bind(...patientIds).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM medications WHERE patient_id IN (${placeholders}) AND is_deleted = 0`).bind(...patientIds).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM clinical_notes WHERE patient_id IN (${placeholders}) AND is_deleted = 0`).bind(...patientIds).first<{ n: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) as n FROM documents WHERE patient_id IN (${placeholders}) AND is_deleted = 0`).bind(...patientIds).first<{ n: number }>(),
  ]);
  const totalRows = counts.reduce((sum, r) => sum + (r?.n ?? 0), 0);
  if (totalRows * BYTES_PER_ROW_ESTIMATE > MAX_EXPORT_BYTES) {
    return c.json({ error: "Export too large. Contact support." }, 413);
  }

  // Fetch patients
  const patientsRows = await c.env.DB.prepare(
    `SELECT id, name, date_of_birth, gender, blood_type, allergies, created_at FROM patient WHERE id IN (${placeholders}) AND is_deleted = 0`
  ).bind(...patientIds).all<Record<string, unknown>>();

  // Fetch per-patient data
  const testResults = await c.env.DB.prepare(
    `SELECT id, patient_id, test_def_id, document_id, date, value, value_text, flag, source_lab, created_at
     FROM test_results WHERE patient_id IN (${placeholders}) AND is_deleted = 0`
  ).bind(...patientIds).all<Record<string, unknown>>();

  const vitals = await c.env.DB.prepare(
    `SELECT id, patient_id, type, measured_at, value_primary, value_secondary, unit, source, created_at
     FROM vital_readings WHERE patient_id IN (${placeholders}) AND is_deleted = 0`
  ).bind(...patientIds).all<Record<string, unknown>>();

  const medications = await c.env.DB.prepare(
    `SELECT id, patient_id, brand_name, generic_name, dosage, form, start_date, end_date, is_active, created_at
     FROM medications WHERE patient_id IN (${placeholders}) AND is_deleted = 0`
  ).bind(...patientIds).all<Record<string, unknown>>();

  const notes = await c.env.DB.prepare(
    `SELECT id, patient_id, visit_date, doctor_name, facility, diagnosis, summary, treatment_plan, created_at
     FROM clinical_notes WHERE patient_id IN (${placeholders}) AND is_deleted = 0`
  ).bind(...patientIds).all<Record<string, unknown>>();

  // Documents: metadata only (r2_key path, no binary content)
  const documents = await c.env.DB.prepare(
    `SELECT id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes, processing_status, created_at
     FROM documents WHERE patient_id IN (${placeholders}) AND is_deleted = 0`
  ).bind(...patientIds).all<Record<string, unknown>>();

  const bundle = {
    manifest: {
      exported_at: new Date().toISOString(),
      user_id: user.sub,
      patient_count: patientsRows.results.length,
      version: "1",
    },
    patients: patientsRows.results,
    test_results: testResults.results,
    vital_readings: vitals.results,
    medications: medications.results,
    clinical_notes: notes.results,
    documents: documents.results,
  };

  const date = new Date().toISOString().slice(0, 10);
  return c.body(JSON.stringify(bundle), 200, {
    "Content-Type": "application/json",
    "Content-Disposition": `attachment; filename="family-health-export-${date}.json"`,
  });
});
