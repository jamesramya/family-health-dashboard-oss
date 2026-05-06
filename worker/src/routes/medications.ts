import { Hono } from "hono";
import type { Bindings } from "../types";

type Variables = {
  user: { sub: string; role: string; email: string };
  patientId: string;
  patientRole: string;
};

type MedicationScheduleInput = {
  id?: string;
  time_of_day: string;
  meal_relation: string;
  dose_quantity: string;
  specific_time?: string;
  instructions?: string;
  days_of_week?: string | null;
};

export const medicationsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// GET /api/patients/:pid/medications — filterable by is_active and document_id
medicationsRoutes.get("/", async (c) => {
  const pid = c.get("patientId");
  const isActiveFilter = c.req.query("is_active");
  const documentId = c.req.query("document_id");

  let sql = `SELECT m.id, m.patient_id, m.document_id, m.brand_name, m.generic_name, m.dosage,
             m.form, m.prescribing_doctor, m.start_date, m.end_date, m.reason, m.is_active,
             m.notes, m.lifecycle_events, m.prescription_ids, m.created_by, m.updated_by, m.created_at, m.updated_at
             FROM medications m
             WHERE m.patient_id = ? AND m.is_deleted = 0`;
  const params: unknown[] = [pid];

  if (isActiveFilter !== undefined) {
    sql += " AND m.is_active = ?";
    params.push(isActiveFilter === "1" || isActiveFilter === "true" ? 1 : 0);
  }

  if (documentId) {
    sql += ` AND m.id IN (
      SELECT m2.id FROM medications m2, json_each(m2.prescription_ids) je
      WHERE je.value = ? AND m2.patient_id = ?
    )`;
    params.push(documentId, pid);
  }

  sql += " ORDER BY m.start_date DESC";

  const result = await c.env.DB.prepare(sql).bind(...params).all();

  // Fetch schedules for each medication
  const medications = await Promise.all(
    result.results.map(async (med: any) => {
      const schedules = await c.env.DB.prepare(
        `SELECT id, medication_id, time_of_day, meal_relation, dose_quantity, specific_time, instructions, days_of_week
         FROM medication_schedules WHERE medication_id = ? AND is_deleted = 0`
      ).bind(med.id).all();
      return {
        ...med,
        lifecycle_events: JSON.parse((med.lifecycle_events as string) || "[]"),
        prescription_ids: JSON.parse((med.prescription_ids as string) || "[]"),
        schedules: schedules.results,
      };
    })
  );

  return c.json({ medications });
});

// GET /api/patients/:pid/medications/:id — single medication with schedules
medicationsRoutes.get("/:id", async (c) => {
  const pid = c.get("patientId");
  const id = c.req.param("id");

  const medication = await c.env.DB.prepare(
    `SELECT id, patient_id, document_id, brand_name, generic_name, dosage, form,
            prescribing_doctor, start_date, end_date, reason, is_active, notes,
            lifecycle_events, prescription_ids, created_by, updated_by, created_at, updated_at
     FROM medications WHERE id = ? AND patient_id = ? AND is_deleted = 0`
  ).bind(id, pid).first();

  if (!medication) return c.json({ error: "Medication not found" }, 404);

  const schedules = await c.env.DB.prepare(
    `SELECT id, time_of_day, meal_relation, dose_quantity, specific_time,
            instructions, days_of_week
     FROM medication_schedules WHERE medication_id = ? AND is_deleted = 0`
  ).bind(id).all();

  return c.json({
    medication: {
      ...medication,
      lifecycle_events: JSON.parse((medication.lifecycle_events as string) || "[]"),
      prescription_ids: JSON.parse((medication.prescription_ids as string) || "[]"),
      schedules: schedules.results,
    },
  });
});

// POST /api/patients/:pid/medications — create with nested schedules (admin)
medicationsRoutes.post("/", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const user = c.get("user");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const body = await c.req.json<{
    brand_name: string;
    generic_name?: string;
    dosage: string;
    form: string;
    prescribing_doctor?: string;
    start_date: string;
    end_date?: string;
    reason?: string;
    notes?: string;
    document_id?: string;
    prescription_ids?: string[];
    schedules?: MedicationScheduleInput[];
  }>();

  if (!body.brand_name || !body.dosage || !body.form || !body.start_date) {
    return c.json({ error: "brand_name, dosage, form, and start_date are required" }, 400);
  }

  const validForms = ["tablet", "capsule", "syrup", "injection", "cream", "drops", "inhaler", "other"];
  if (!validForms.includes(body.form)) {
    return c.json({ error: `form must be one of: ${validForms.join(", ")}` }, 400);
  }

  // Dual-write: prescription_ids wins; legacy document_id falls back
  let rxIds: string[];
  if ("prescription_ids" in body) {
    rxIds = body.prescription_ids ?? [];
  } else if (body.document_id) {
    rxIds = [body.document_id];
  } else {
    rxIds = [];
  }
  const documentId =
    "prescription_ids" in body ? (rxIds[0] ?? null) : (body.document_id ?? null);

  const startedEvent: Record<string, string> = { event: "started", date: body.start_date };
  if (rxIds[0]) startedEvent.document_id = rxIds[0];
  const lifecycleEvents = JSON.stringify([startedEvent]);

  const id = crypto.randomUUID();

  await c.env.DB.prepare(`
    INSERT INTO medications
      (id, patient_id, document_id, brand_name, generic_name, dosage, form, prescribing_doctor,
       start_date, end_date, reason, notes, lifecycle_events, prescription_ids, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, pid, documentId, body.brand_name, body.generic_name ?? null,
    body.dosage, body.form, body.prescribing_doctor ?? null,
    body.start_date, body.end_date ?? null, body.reason ?? null,
    body.notes ?? null, lifecycleEvents, JSON.stringify(rxIds), user.sub, user.sub
  ).run();

  // Insert schedules if provided
  if (body.schedules && body.schedules.length > 0) {
    for (const sched of body.schedules) {
      const schedId = crypto.randomUUID();
      await c.env.DB.prepare(`
        INSERT INTO medication_schedules
          (id, medication_id, time_of_day, meal_relation, dose_quantity,
           specific_time, instructions, days_of_week, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        schedId, id, sched.time_of_day, sched.meal_relation,
        sched.dose_quantity ?? null,
        sched.specific_time ?? null,
        sched.instructions ?? null,
        sched.days_of_week ?? null,
        user.sub, user.sub
      ).run();
    }
  }

  const medication = await c.env.DB.prepare(
    `SELECT id, patient_id, document_id, brand_name, generic_name, dosage, form,
            prescribing_doctor, start_date, end_date, reason, is_active, notes,
            lifecycle_events, prescription_ids, created_by, updated_by, created_at, updated_at
     FROM medications WHERE id = ?`
  ).bind(id).first();
  const schedules = await c.env.DB.prepare(
    "SELECT * FROM medication_schedules WHERE medication_id = ? AND is_deleted = 0"
  ).bind(id).all();

  return c.json({
    medication: {
      ...medication,
      lifecycle_events: JSON.parse((medication!.lifecycle_events as string) || "[]"),
      prescription_ids: JSON.parse((medication!.prescription_ids as string) || "[]"),
      schedules: schedules.results,
    },
  }, 201);
});

// PUT /api/patients/:pid/medications/:id — update medication + upsert schedules (admin)
medicationsRoutes.put("/:id", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const user = c.get("user");
  const id = c.req.param("id");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id, dosage, lifecycle_events FROM medications WHERE id = ? AND patient_id = ? AND is_deleted = 0"
  ).bind(id, pid).first<{ id: string; dosage: string; lifecycle_events: string }>();

  if (!existing) return c.json({ error: "Medication not found" }, 404);

  const body = await c.req.json<{
    brand_name?: string;
    generic_name?: string;
    dosage?: string;
    form?: string;
    prescribing_doctor?: string;
    start_date?: string;
    end_date?: string;
    reason?: string;
    notes?: string;
    is_active?: number;
    schedules?: MedicationScheduleInput[];
  }>();

  const now = new Date().toISOString();

  // Append dosage_changed event if dosage differs
  const events: Record<string, string>[] = JSON.parse(existing.lifecycle_events || "[]");
  if ("dosage" in body && body.dosage !== undefined && body.dosage !== existing.dosage) {
    events.push({
      event: "dosage_changed",
      date: now.slice(0, 10),
      old_value: existing.dosage,
      new_value: body.dosage,
    });
  }

  // Build dynamic UPDATE — only set fields present in the request body
  const medSetClauses: string[] = ["lifecycle_events = ?", "updated_by = ?", "updated_at = ?"];
  const medBindValues: unknown[] = [JSON.stringify(events), user.sub, now];

  const medFieldMap: [string, unknown][] = [
    ["brand_name", body.brand_name],
    ["generic_name", body.generic_name],
    ["dosage", body.dosage],
    ["form", body.form],
    ["prescribing_doctor", body.prescribing_doctor],
    ["start_date", body.start_date],
    ["end_date", body.end_date],
    ["reason", body.reason],
    ["notes", body.notes],
    ["is_active", body.is_active],
  ];

  for (const [field, value] of medFieldMap) {
    if (field in body) {
      medSetClauses.unshift(`${field} = ?`);
      medBindValues.unshift(value ?? null);
    }
  }

  medBindValues.push(id);

  await c.env.DB.prepare(
    `UPDATE medications SET ${medSetClauses.join(", ")} WHERE id = ?`
  ).bind(...medBindValues).run();

  // Handle schedules only if the key is present in the body
  if ("schedules" in body && body.schedules !== undefined) {
    const submitted = body.schedules ?? [];
    const now2 = new Date().toISOString();

    // Collect ids of rows being updated (rows that already have a DB id)
    const keepIds = submitted.filter((s) => s.id).map((s) => s.id as string);

    // Upsert each submitted row; track newly inserted UUIDs so soft-delete keeps them
    for (const sched of submitted) {
      if (sched.id) {
        await c.env.DB.prepare(`
          UPDATE medication_schedules
          SET time_of_day = ?, meal_relation = ?, dose_quantity = ?,
              specific_time = ?, instructions = ?, days_of_week = ?,
              updated_by = ?, updated_at = ?
          WHERE id = ? AND medication_id = ?
        `).bind(
          sched.time_of_day, sched.meal_relation, sched.dose_quantity ?? null,
          sched.specific_time ?? null, sched.instructions ?? null,
          sched.days_of_week ?? null,
          user.sub, now2, sched.id, id
        ).run();
      } else {
        const schedId = crypto.randomUUID();
        keepIds.push(schedId); // don't soft-delete rows we just inserted
        await c.env.DB.prepare(`
          INSERT INTO medication_schedules
            (id, medication_id, time_of_day, meal_relation, dose_quantity,
             specific_time, instructions, days_of_week, created_by, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          schedId, id, sched.time_of_day, sched.meal_relation,
          sched.dose_quantity ?? null,
          sched.specific_time ?? null, sched.instructions ?? null,
          sched.days_of_week ?? null,
          user.sub, user.sub
        ).run();
      }
    }

    // Soft-delete stale rows.
    // IMPORTANT: Never build NOT IN () with an empty list — that is invalid SQLite.
    if (keepIds.length > 0) {
      // Keep submitted rows (updated or newly inserted). Delete everything else.
      const placeholders = keepIds.map(() => "?").join(", ");
      await c.env.DB.prepare(
        `UPDATE medication_schedules
         SET is_deleted = 1, updated_by = ?, updated_at = ?
         WHERE medication_id = ? AND id NOT IN (${placeholders}) AND is_deleted = 0`
      ).bind(user.sub, now2, id, ...keepIds).run();
    } else {
      // Empty array OR all pure inserts (no submitted id) — delete all existing rows.
      await c.env.DB.prepare(
        `UPDATE medication_schedules
         SET is_deleted = 1, updated_by = ?, updated_at = ?
         WHERE medication_id = ? AND is_deleted = 0`
      ).bind(user.sub, now2, id).run();
    }
  }

  const medication = await c.env.DB.prepare(
    `SELECT id, patient_id, document_id, brand_name, generic_name, dosage, form,
            prescribing_doctor, start_date, end_date, reason, is_active, notes,
            lifecycle_events, prescription_ids, created_by, updated_by, created_at, updated_at
     FROM medications WHERE id = ?`
  ).bind(id).first();
  const schedules = await c.env.DB.prepare(
    "SELECT * FROM medication_schedules WHERE medication_id = ? AND is_deleted = 0"
  ).bind(id).all();

  return c.json({
    medication: {
      ...medication,
      lifecycle_events: JSON.parse((medication!.lifecycle_events as string) || "[]"),
      prescription_ids: JSON.parse((medication!.prescription_ids as string) || "[]"),
      schedules: schedules.results,
    },
  });
});

// POST /api/patients/:pid/medications/:id/discontinue — set end_date, is_active=0, append stopped event (admin)
medicationsRoutes.post("/:id/discontinue", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const user = c.get("user");
  const id = c.req.param("id");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const existing = await c.env.DB.prepare(
    `SELECT id, is_active, lifecycle_events FROM medications
     WHERE id = ? AND patient_id = ? AND is_deleted = 0`
  ).bind(id, pid).first<{ id: string; is_active: number; lifecycle_events: string }>();

  if (!existing) return c.json({ error: "Medication not found" }, 404);

  const body: { end_date?: string; note?: string } = await c.req.json().catch(() => ({}));
  const endDate = body.end_date ?? new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  const events = JSON.parse(existing.lifecycle_events || "[]");
  events.push({
    event: "stopped",
    date: endDate,
    ...(body.note ? { note: body.note } : {}),
  });

  await c.env.DB.prepare(`
    UPDATE medications
    SET is_active = 0, end_date = ?, lifecycle_events = ?, updated_by = ?, updated_at = ?
    WHERE id = ?
  `).bind(endDate, JSON.stringify(events), user.sub, now, id).run();

  const medication = await c.env.DB.prepare(
    `SELECT id, patient_id, document_id, brand_name, generic_name, dosage, form,
            prescribing_doctor, start_date, end_date, reason, is_active, notes,
            lifecycle_events, prescription_ids, created_by, updated_by, created_at, updated_at
     FROM medications WHERE id = ?`
  ).bind(id).first();

  const schedules = await c.env.DB.prepare(
    `SELECT id, time_of_day, meal_relation, dose_quantity, specific_time,
            instructions, days_of_week
     FROM medication_schedules WHERE medication_id = ? AND is_deleted = 0`
  ).bind(id).all();

  return c.json({
    medication: {
      ...medication,
      lifecycle_events: JSON.parse((medication!.lifecycle_events as string) || "[]"),
      prescription_ids: JSON.parse((medication!.prescription_ids as string) || "[]"),
      schedules: schedules.results,
    },
  });
});

// POST /api/patients/:pid/medications/:id/restart — reactivate discontinued medication (admin)
medicationsRoutes.post("/:id/restart", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const user = c.get("user");
  const id = c.req.param("id");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const existing = await c.env.DB.prepare(
    `SELECT id, lifecycle_events, prescription_ids FROM medications
     WHERE id = ? AND patient_id = ? AND is_deleted = 0`
  ).bind(id, pid).first<{ id: string; lifecycle_events: string; prescription_ids: string }>();

  if (!existing) return c.json({ error: "Medication not found" }, 404);

  const body: { note?: string; document_id?: string } = await c.req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  const events = JSON.parse(existing.lifecycle_events || "[]");
  events.push({
    event: "restarted",
    date: today,
    ...(body.note ? { note: body.note } : {}),
    ...(body.document_id ? { document_id: body.document_id } : {}),
  });

  const rxIds: string[] = JSON.parse(existing.prescription_ids || "[]");
  if (body.document_id && !rxIds.includes(body.document_id)) {
    rxIds.push(body.document_id);
  }

  await c.env.DB.prepare(`
    UPDATE medications
    SET is_active = 1, end_date = NULL,
        lifecycle_events = ?, prescription_ids = ?,
        updated_by = ?, updated_at = ?
    WHERE id = ?
  `).bind(JSON.stringify(events), JSON.stringify(rxIds), user.sub, now, id).run();

  const medication = await c.env.DB.prepare(
    `SELECT id, patient_id, document_id, brand_name, generic_name, dosage, form,
            prescribing_doctor, start_date, end_date, reason, is_active, notes,
            lifecycle_events, prescription_ids, created_by, updated_by, created_at, updated_at
     FROM medications WHERE id = ?`
  ).bind(id).first();

  const schedules = await c.env.DB.prepare(
    `SELECT id, time_of_day, meal_relation, dose_quantity, specific_time,
            instructions, days_of_week
     FROM medication_schedules WHERE medication_id = ? AND is_deleted = 0`
  ).bind(id).all();

  return c.json({
    medication: {
      ...medication,
      lifecycle_events: JSON.parse((medication!.lifecycle_events as string) || "[]"),
      prescription_ids: JSON.parse((medication!.prescription_ids as string) || "[]"),
      schedules: schedules.results,
    },
  });
});

// DELETE /api/patients/:pid/medications/:id — soft-delete (admin)
medicationsRoutes.delete("/:id", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const user = c.get("user");
  const id = c.req.param("id");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM medications WHERE id = ? AND patient_id = ? AND is_deleted = 0"
  ).bind(id, pid).first();

  if (!existing) return c.json({ error: "Medication not found" }, 404);

  const now = new Date().toISOString();
  await Promise.all([
    c.env.DB.prepare(
      `UPDATE medications SET is_deleted = 1, deleted_at = ?, deleted_by = ?, updated_at = ?, updated_by = ?
       WHERE id = ?`
    ).bind(now, user.sub, now, user.sub, id).run(),
    c.env.DB.prepare(
      `UPDATE medication_schedules SET is_deleted = 1, deleted_at = ?, deleted_by = ?, updated_at = ?, updated_by = ?
       WHERE medication_id = ? AND is_deleted = 0`
    ).bind(now, user.sub, now, user.sub, id).run(),
  ]);

  return new Response(null, { status: 204 });
});
