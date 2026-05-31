import { Hono } from "hono";
import type { Bindings } from "../types";

type Variables = {
  user: { sub: string; role: string; email: string };
};

export const patientRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// GET /api/patients — list patients accessible to current user; super admin sees all
patientRoutes.get("/", async (c) => {
  const user = c.get("user");

  const superAdminRow = await c.env.DB.prepare(
    "SELECT is_super_admin FROM users WHERE id = ?"
  ).bind(user.sub).first<{ is_super_admin: number }>();

  let patients: unknown[];

  if (superAdminRow?.is_super_admin) {
    // Super admin sees all non-deleted patients
    const result = await c.env.DB.prepare(
      "SELECT id, name, date_of_birth, gender, blood_type, allergies, photo_r2_key, created_at FROM patient WHERE is_deleted = 0 ORDER BY created_at DESC"
    ).all();
    patients = result.results;
  } else {
    // Regular user: join user_patient_access
    const result = await c.env.DB.prepare(
      `SELECT p.id, p.name, p.date_of_birth, p.gender, p.blood_type, p.allergies, p.photo_r2_key, p.created_at, upa.role
       FROM patient p
       JOIN user_patient_access upa ON upa.patient_id = p.id
       WHERE upa.user_id = ? AND p.is_deleted = 0
       ORDER BY p.created_at DESC`
    ).bind(user.sub).all();
    patients = result.results;
  }

  return c.json({ patients });
});

// POST /api/patients — create patient (super admin only)
patientRoutes.post("/", async (c) => {
  const user = c.get("user");

  // Check super admin
  const superAdminRow = await c.env.DB.prepare(
    "SELECT is_super_admin FROM users WHERE id = ?"
  ).bind(user.sub).first<{ is_super_admin: number }>();

  if (!superAdminRow?.is_super_admin) {
    return c.json({ error: "Forbidden: super admin only" }, 403);
  }

  const body = await c.req.json<{
    name?: string;
    date_of_birth?: string;
    gender?: string;
    blood_type?: string;
    allergies?: string[];
  }>();

  if (!body.name || !body.date_of_birth || !body.gender) {
    return c.json({ error: "name, date_of_birth, and gender are required" }, 400);
  }

  const id = crypto.randomUUID();
  const allergiesJson = body.allergies ? JSON.stringify(body.allergies) : null;

  await c.env.DB.prepare(
    `INSERT INTO patient (id, name, date_of_birth, gender, blood_type, allergies, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, body.name, body.date_of_birth, body.gender, body.blood_type ?? null, allergiesJson, user.sub, user.sub).run();

  // Auto-grant creator admin access
  await c.env.DB.prepare(
    "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), user.sub, id, "admin", user.sub).run();

  const patient = await c.env.DB.prepare(
    "SELECT id, name, date_of_birth, gender, blood_type, allergies, created_at FROM patient WHERE id = ?"
  ).bind(id).first();

  return c.json({ patient }, 201);
});

// POST /api/patients/:pid/access — grant user access (super admin or patient-admin)
patientRoutes.post("/:pid/access", async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  // Determine if user is super admin or patient-admin
  const superAdminRow = await c.env.DB.prepare(
    "SELECT is_super_admin FROM users WHERE id = ?"
  ).bind(user.sub).first<{ is_super_admin: number }>();

  if (!superAdminRow?.is_super_admin) {
    // Check if user is admin for this patient
    const accessRow = await c.env.DB.prepare(
      "SELECT role FROM user_patient_access WHERE user_id = ? AND patient_id = ?"
    ).bind(user.sub, pid).first<{ role: string }>();

    if (!accessRow || accessRow.role !== "admin") {
      return c.json({ error: "Forbidden: must be super admin or patient admin" }, 403);
    }
  }

  const body = await c.req.json<{ user_id?: string; role?: string }>();
  if (!body.user_id || !body.role) {
    return c.json({ error: "user_id and role are required" }, 400);
  }

  // Validate target user exists
  const targetUser = await c.env.DB.prepare(
    "SELECT id FROM users WHERE id = ?"
  ).bind(body.user_id).first();
  if (!targetUser) {
    return c.json({ error: "User not found" }, 404);
  }

  // Upsert access — if already exists, update role
  const existing = await c.env.DB.prepare(
    "SELECT id FROM user_patient_access WHERE user_id = ? AND patient_id = ?"
  ).bind(body.user_id, pid).first<{ id: string }>();

  if (existing) {
    await c.env.DB.prepare(
      "UPDATE user_patient_access SET role = ? WHERE id = ?"
    ).bind(body.role, existing.id).run();
  } else {
    await c.env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), body.user_id, pid, body.role, user.sub).run();
  }

  return c.json({ ok: true }, 201);
});

// PUT /api/patients/:pid — update patient fields (super admin or patient-admin)
patientRoutes.put("/:pid", async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  const superAdminRow = await c.env.DB.prepare(
    "SELECT is_super_admin FROM users WHERE id = ?"
  ).bind(user.sub).first<{ is_super_admin: number }>();

  if (!superAdminRow?.is_super_admin) {
    const accessRow = await c.env.DB.prepare(
      "SELECT role FROM user_patient_access WHERE user_id = ? AND patient_id = ?"
    ).bind(user.sub, pid).first<{ role: string }>();

    if (!accessRow || accessRow.role !== "admin") {
      return c.json({ error: "Forbidden: must be super admin or patient admin" }, 403);
    }
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM patient WHERE id = ? AND is_deleted = 0"
  ).bind(pid).first();

  if (!existing) {
    return c.json({ error: "Patient not found" }, 404);
  }

  const body = await c.req.json<{
    name?: string;
    date_of_birth?: string;
    gender?: string;
    blood_type?: string;
    allergies?: string[];
  }>();

  if (body.date_of_birth !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(body.date_of_birth)) {
    return c.json({ error: "date_of_birth must be YYYY-MM-DD" }, 400);
  }

  const validGenders = ["male", "female", "other"];
  if (body.gender !== undefined && !validGenders.includes(body.gender)) {
    return c.json({ error: "gender must be one of: male, female, other" }, 400);
  }

  const updates: string[] = [];
  const bindings: unknown[] = [];

  if (body.name !== undefined) { updates.push("name = ?"); bindings.push(body.name); }
  if (body.date_of_birth !== undefined) { updates.push("date_of_birth = ?"); bindings.push(body.date_of_birth); }
  if (body.gender !== undefined) { updates.push("gender = ?"); bindings.push(body.gender); }
  if (body.blood_type !== undefined) { updates.push("blood_type = ?"); bindings.push(body.blood_type); }
  if (body.allergies !== undefined) { updates.push("allergies = ?"); bindings.push(JSON.stringify(body.allergies)); }

  if (updates.length > 0) {
    updates.push("updated_by = ?", "updated_at = datetime('now')");
    bindings.push(user.sub, pid);
    await c.env.DB.prepare(
      `UPDATE patient SET ${updates.join(", ")} WHERE id = ?`
    ).bind(...bindings).run();
  }

  const patient = await c.env.DB.prepare(
    "SELECT id, name, date_of_birth, gender, blood_type, allergies, photo_r2_key, created_at, updated_at FROM patient WHERE id = ?"
  ).bind(pid).first();

  return c.json({ patient });
});

// DELETE /api/patients/:pid/purge — cascade delete all patient data (super admin or patient-admin)
patientRoutes.delete("/:pid/purge", async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");

  const superAdminRow = await c.env.DB.prepare(
    "SELECT is_super_admin FROM users WHERE id = ?"
  ).bind(user.sub).first<{ is_super_admin: number }>();

  if (!superAdminRow?.is_super_admin) {
    const accessRow = await c.env.DB.prepare(
      "SELECT role FROM user_patient_access WHERE user_id = ? AND patient_id = ?"
    ).bind(user.sub, pid).first<{ role: string }>();

    if (!accessRow || accessRow.role !== "admin") {
      return c.json({ error: "Forbidden: must be super admin or patient admin" }, 403);
    }
  }

  const patientRow = await c.env.DB.prepare(
    "SELECT id FROM patient WHERE id = ?"
  ).bind(pid).first();

  if (!patientRow) {
    return c.json({ error: "Patient not found" }, 404);
  }

  // Delete R2 objects for this patient before deleting documents
  const prefix = `patients/${pid}/`;
  let r2ObjectsDeleted = 0;
  let cursor: string | undefined;
  do {
    const listed: R2Objects = await c.env.BUCKET.list({ prefix, cursor });
    for (const obj of listed.objects) {
      await c.env.BUCKET.delete(obj.key);
      r2ObjectsDeleted++;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  // Cascade deletes — explicit (FK cascade not guaranteed without PRAGMA foreign_keys = ON)
  let totalRows = 0;

  const testResults = await c.env.DB.prepare(
    "DELETE FROM test_results WHERE patient_id = ?"
  ).bind(pid).run();
  totalRows += testResults.meta.changes ?? 0;

  const vitalReadings = await c.env.DB.prepare(
    "DELETE FROM vital_readings WHERE patient_id = ?"
  ).bind(pid).run();
  totalRows += vitalReadings.meta.changes ?? 0;

  // medication_schedules cascade via FK on medications(id), but delete explicitly
  const medIds = await c.env.DB.prepare(
    "SELECT id FROM medications WHERE patient_id = ?"
  ).bind(pid).all<{ id: string }>();
  for (const med of medIds.results) {
    const sched = await c.env.DB.prepare(
      "DELETE FROM medication_schedules WHERE medication_id = ?"
    ).bind(med.id).run();
    totalRows += sched.meta.changes ?? 0;
  }

  const medications = await c.env.DB.prepare(
    "DELETE FROM medications WHERE patient_id = ?"
  ).bind(pid).run();
  totalRows += medications.meta.changes ?? 0;

  const scanFindings = await c.env.DB.prepare(
    "DELETE FROM scan_findings WHERE patient_id = ?"
  ).bind(pid).run();
  totalRows += scanFindings.meta.changes ?? 0;

  const cultureResults = await c.env.DB.prepare(
    "DELETE FROM culture_results WHERE patient_id = ?"
  ).bind(pid).run();
  totalRows += cultureResults.meta.changes ?? 0;

  const clinicalNotes = await c.env.DB.prepare(
    "DELETE FROM clinical_notes WHERE patient_id = ?"
  ).bind(pid).run();
  totalRows += clinicalNotes.meta.changes ?? 0;

  const documents = await c.env.DB.prepare(
    "DELETE FROM documents WHERE patient_id = ?"
  ).bind(pid).run();
  totalRows += documents.meta.changes ?? 0;

  const accessRows = await c.env.DB.prepare(
    "DELETE FROM user_patient_access WHERE patient_id = ?"
  ).bind(pid).run();
  totalRows += accessRows.meta.changes ?? 0;

  const patientDelete = await c.env.DB.prepare(
    "DELETE FROM patient WHERE id = ?"
  ).bind(pid).run();
  totalRows += patientDelete.meta.changes ?? 0;

  // Log the purge
  await c.env.DB.prepare(
    "INSERT INTO purge_log (id, tables_affected, total_rows, r2_objects_deleted) VALUES (?, ?, ?, ?)"
  ).bind(
    crypto.randomUUID(),
    JSON.stringify([
      "test_results", "vital_readings", "medication_schedules", "medications",
      "scan_findings", "culture_results", "clinical_notes", "documents",
      "user_patient_access", "patient",
    ]),
    totalRows,
    r2ObjectsDeleted,
  ).run();

  return c.json({ purged: true });
});

// DELETE /api/patients/:pid/access/:uid — revoke access
patientRoutes.delete("/:pid/access/:uid", async (c) => {
  const user = c.get("user");
  const pid = c.req.param("pid");
  const uid = c.req.param("uid");

  // Determine if user is super admin or patient-admin
  const superAdminRow = await c.env.DB.prepare(
    "SELECT is_super_admin FROM users WHERE id = ?"
  ).bind(user.sub).first<{ is_super_admin: number }>();

  if (!superAdminRow?.is_super_admin) {
    const accessRow = await c.env.DB.prepare(
      "SELECT role FROM user_patient_access WHERE user_id = ? AND patient_id = ?"
    ).bind(user.sub, pid).first<{ role: string }>();

    if (!accessRow || accessRow.role !== "admin") {
      return c.json({ error: "Forbidden: must be super admin or patient admin" }, 403);
    }
  }

  // Cannot revoke super admin's own access
  const targetSuperAdmin = await c.env.DB.prepare(
    "SELECT is_super_admin FROM users WHERE id = ?"
  ).bind(uid).first<{ is_super_admin: number }>();

  if (targetSuperAdmin?.is_super_admin) {
    return c.json({ error: "Cannot revoke super admin access" }, 403);
  }

  // Check access row exists
  const accessRow = await c.env.DB.prepare(
    "SELECT id FROM user_patient_access WHERE user_id = ? AND patient_id = ?"
  ).bind(uid, pid).first<{ id: string }>();

  if (!accessRow) {
    return c.json({ error: "Access record not found" }, 404);
  }

  await c.env.DB.prepare(
    "DELETE FROM user_patient_access WHERE id = ?"
  ).bind(accessRow.id).run();

  return c.json({ ok: true });
});
