import { Hono } from "hono";
import type { Bindings } from "../types";

type Variables = {
  user: { sub: string; role: string; email: string };
  patientId: string;
  patientRole: string;
};

export const dashboardRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// GET /api/patients/:pid/dashboard/summary
dashboardRoutes.get("/summary", async (c) => {
  const pid = c.get("patientId");

  const [
    patientRow,
    latestVitalsResult,
    bloodWorkAlertsResult,
    activeMedsResult,
    recentDocsResult,
    pendingRx,
    docsTs,
    vitalsTs,
    testsTs,
    notesTs,
    scansTs,
    medsTs,
  ] = await Promise.all([
    // Patient info
    c.env.DB.prepare(
      `SELECT id, name, date_of_birth, gender, blood_type, allergies, photo_r2_key
       FROM patient WHERE id = ? AND is_deleted = 0`
    ).bind(pid).first(),

    // Latest vitals — last 30 readings per type, newest first.
    // Dashboard renders the newest as the headline value and the rest as a sparkline.
    c.env.DB.prepare(
      `SELECT id, type, measured_at, value_primary, value_secondary, value_tertiary, unit, context, notes
       FROM (
         SELECT vr.id, vr.type, vr.measured_at, vr.value_primary, vr.value_secondary, vr.value_tertiary,
                vr.unit, vr.context, vr.notes,
                ROW_NUMBER() OVER (PARTITION BY vr.type ORDER BY vr.measured_at DESC) AS rn
         FROM vital_readings vr
         WHERE vr.patient_id = ? AND vr.is_deleted = 0
       )
       WHERE rn <= 30
       ORDER BY type, measured_at DESC`
    ).bind(pid).all(),

    // Blood work alerts — latest reading per test where flag is HIGH or LOW,
    // restricted to the 5 most recent report dates so stale old outliers don't appear
    c.env.DB.prepare(
      `SELECT tr.id, tr.test_def_id, tr.date, tr.value, tr.value_text, tr.flag, tr.source_lab,
              td.label, td.unit, td.category,
              td.ref_low as ref_low_at_test, td.ref_high as ref_high_at_test
       FROM test_results tr
       JOIN test_definitions td ON td.id = tr.test_def_id
       WHERE tr.patient_id = ? AND tr.is_deleted = 0 AND td.is_deleted = 0
         AND tr.date = (
           SELECT MAX(tr2.date)
           FROM test_results tr2
           WHERE tr2.test_def_id = tr.test_def_id
             AND tr2.patient_id = ?
             AND tr2.is_deleted = 0
         )
         AND tr.date IN (
           SELECT DISTINCT date FROM test_results
           WHERE patient_id = ? AND is_deleted = 0
           ORDER BY date DESC LIMIT 5
         )
         AND tr.flag IN ('HIGH', 'LOW')
       ORDER BY td.category, td.sort_order
       LIMIT 20`
    ).bind(pid, pid, pid).all(),

    // Active medications count
    c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM medications
       WHERE patient_id = ? AND is_active = 1 AND is_deleted = 0`
    ).bind(pid).first<{ cnt: number }>(),

    // Recent documents — last 5, ordered by created_at desc
    c.env.DB.prepare(
      `SELECT id, type, title, document_date, processing_status, mime_type, created_at
       FROM documents
       WHERE patient_id = ? AND is_deleted = 0
       ORDER BY created_at DESC
       LIMIT 5`
    ).bind(pid).all(),

    // Pending prescription reviews
    c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM documents
       WHERE patient_id = ? AND type = 'prescription'
         AND medication_review_status = 'pending_review' AND is_deleted = 0`
    ).bind(pid).first<{ count: number }>(),

    // Last activity — MAX updated_at across all domain tables (6 separate queries to stay within D1's compound SELECT limit of 5)
    c.env.DB.prepare(`SELECT MAX(updated_at) as ts FROM documents      WHERE patient_id = ? AND is_deleted = 0`).bind(pid).first<{ ts: string | null }>(),
    c.env.DB.prepare(`SELECT MAX(updated_at) as ts FROM vital_readings WHERE patient_id = ? AND is_deleted = 0`).bind(pid).first<{ ts: string | null }>(),
    c.env.DB.prepare(`SELECT MAX(updated_at) as ts FROM test_results   WHERE patient_id = ? AND is_deleted = 0`).bind(pid).first<{ ts: string | null }>(),
    c.env.DB.prepare(`SELECT MAX(updated_at) as ts FROM clinical_notes WHERE patient_id = ? AND is_deleted = 0`).bind(pid).first<{ ts: string | null }>(),
    c.env.DB.prepare(`SELECT MAX(updated_at) as ts FROM scan_findings  WHERE patient_id = ? AND is_deleted = 0`).bind(pid).first<{ ts: string | null }>(),
    c.env.DB.prepare(`SELECT MAX(updated_at) as ts FROM medications    WHERE patient_id = ? AND is_deleted = 0`).bind(pid).first<{ ts: string | null }>(),
  ]);

  if (!patientRow) {
    return c.json({ error: "Patient not found" }, 404);
  }

  const last_activity =
    [docsTs, vitalsTs, testsTs, notesTs, scansTs, medsTs]
      .map(r => r?.ts ?? null)
      .filter((ts): ts is string => !!ts)
      .sort()
      .pop() ?? null;

  return c.json({
    patient: patientRow,
    latest_vitals: latestVitalsResult.results,
    blood_work_alerts: bloodWorkAlertsResult.results,
    active_medications_count: activeMedsResult?.cnt ?? 0,
    recent_documents: recentDocsResult.results,
    pending_prescription_reviews: pendingRx?.count ?? 0,
    last_activity,
  });
});
