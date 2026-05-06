import { Hono } from "hono";
import type { Bindings } from "../types";

type Variables = {
  user: { sub: string; role: string; email: string };
  patientId: string;
  patientRole: string;
};

export const bloodWorkRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// GET /api/patients/:pid/blood-work — all test defs + readings, grouped by category
// With ?document_id=, returns flat results array instead of nested categories
bloodWorkRoutes.get("/", async (c) => {
  const pid = c.get("patientId");
  const documentId = c.req.query("document_id");

  if (documentId) {
    const result = await c.env.DB.prepare(
      `SELECT tr.id, tr.test_def_id, tr.date, tr.value, tr.value_text, tr.flag, tr.source_lab,
              tr.ref_low_at_test, tr.ref_high_at_test, tr.document_id,
              td.label, td.unit, td.category, td.ref_low, td.ref_high
       FROM test_results tr
       JOIN test_definitions td ON td.id = tr.test_def_id
       WHERE tr.patient_id = ? AND tr.document_id = ? AND tr.is_deleted = 0 AND td.is_deleted = 0
       ORDER BY td.category, td.sort_order ASC`
    ).bind(pid, documentId).all();
    return c.json({ results: result.results });
  }

  // Fetch all active test definitions (exclude soft-deleted)
  const defsResult = await c.env.DB.prepare(
    `SELECT id, canonical_name, label, unit, category, ref_low, ref_high, ref_source, sort_order, note
     FROM test_definitions
     WHERE is_deleted = 0
     ORDER BY category, sort_order ASC`
  ).all<{
    id: string;
    canonical_name: string;
    label: string;
    unit: string;
    category: string;
    ref_low: number | null;
    ref_high: number | null;
    ref_source: string | null;
    sort_order: number;
    note: string | null;
  }>();

  // Fetch all non-deleted readings for this patient
  const readingsResult = await c.env.DB.prepare(
    `SELECT id, test_def_id, date, value, value_text, flag, source_lab, created_at,
            ref_low_at_test, ref_high_at_test
     FROM test_results
     WHERE patient_id = ? AND is_deleted = 0
     ORDER BY date DESC`
  ).bind(pid).all<{
    id: string;
    test_def_id: string;
    date: string;
    value: number | null;
    value_text: string | null;
    flag: string;
    source_lab: string | null;
    created_at: string;
    ref_low_at_test: number | null;
    ref_high_at_test: number | null;
  }>();

  // Group readings by test_def_id
  const readingsByDef = new Map<string, typeof readingsResult.results>();
  for (const reading of readingsResult.results) {
    if (!readingsByDef.has(reading.test_def_id)) {
      readingsByDef.set(reading.test_def_id, []);
    }
    readingsByDef.get(reading.test_def_id)!.push(reading);
  }

  // Group test defs by category
  const categoryMap = new Map<string, typeof defsResult.results>();
  for (const def of defsResult.results) {
    if (!categoryMap.has(def.category)) {
      categoryMap.set(def.category, []);
    }
    categoryMap.get(def.category)!.push(def);
  }

  const categories = Array.from(categoryMap.entries()).map(([category, defs]) => ({
    category,
    tests: defs.map((def) => ({
      ...def,
      readings: readingsByDef.get(def.id) ?? [],
    })),
  }));

  return c.json({ categories });
});

// GET /api/patients/:pid/blood-work/alerts — latest reading per test where flag is HIGH or LOW
bloodWorkRoutes.get("/alerts", async (c) => {
  const pid = c.get("patientId");

  // Get the most recent reading per test_def where that reading is flagged
  const result = await c.env.DB.prepare(
    `SELECT tr.id, tr.test_def_id, tr.date, tr.value, tr.value_text, tr.flag, tr.source_lab,
            tr.ref_low_at_test, tr.ref_high_at_test,
            td.label, td.unit, td.category
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
       AND tr.flag IN ('HIGH', 'LOW')
     ORDER BY td.category, td.sort_order`
  ).bind(pid, pid).all();

  return c.json({ alerts: result.results });
});

// GET /api/patients/:pid/blood-work/:testId/trend — chronological readings for one test
bloodWorkRoutes.get("/:testId/trend", async (c) => {
  const pid = c.get("patientId");
  const testId = c.req.param("testId");

  // Validate test definition exists and is not deleted
  const testDef = await c.env.DB.prepare(
    "SELECT id, canonical_name, label, unit, category, ref_low, ref_high FROM test_definitions WHERE id = ? AND is_deleted = 0"
  ).bind(testId).first();

  if (!testDef) return c.json({ error: "Test definition not found" }, 404);

  const result = await c.env.DB.prepare(
    `SELECT id, test_def_id, date, value, value_text, flag, source_lab, created_at,
            ref_low_at_test, ref_high_at_test
     FROM test_results
     WHERE patient_id = ? AND test_def_id = ? AND is_deleted = 0
     ORDER BY date ASC`
  ).bind(pid, testId).all();

  return c.json({ test_definition: testDef, readings: result.results });
});
