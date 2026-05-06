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
