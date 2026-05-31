import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Bindings } from "../types";
import { hashPassword, sha256hex, constantTimeEqual } from "../services/crypto";
import { verifyAccessToken } from "../services/jwt";
import { collectBackupData } from "../services/backup";

type Variables = {
  user: { sub: string; role: string; email: string };
};

export const adminRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// GET /api/admin/users — list all users
adminRoutes.get("/users", async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT id, email, role, display_name, is_super_admin, must_change_pw, created_at, updated_at FROM users ORDER BY created_at DESC"
  ).all();

  return c.json({ users: result.results });
});

// POST /api/admin/users — create user
adminRoutes.post("/users", async (c) => {
  const adminId = c.get("user").sub;
  const body = await c.req.json<{
    email: string;
    display_name: string;
    role: string;
    password?: string;
  }>();

  if (!body.email || !body.display_name || !body.role) {
    return c.json({ error: "email, display_name, and role are required" }, 400);
  }

  const validRoles = ["admin", "viewer"];
  if (!validRoles.includes(body.role)) {
    return c.json({ error: `role must be one of: ${validRoles.join(", ")}` }, 400);
  }

  // Check for duplicate email
  const existing = await c.env.DB.prepare(
    "SELECT id FROM users WHERE email = ?"
  ).bind(body.email).first();
  if (existing) {
    return c.json({ error: "A user with this email already exists" }, 409);
  }

  const id = crypto.randomUUID();
  // Generate temp password if not provided
  const tempPassword = body.password ?? generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const patients = await c.env.DB.prepare(
    "SELECT id FROM patient WHERE is_deleted = 0"
  ).all<{ id: string }>();

  const insertUser = c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, role, display_name, must_change_pw)
     VALUES (?, ?, ?, ?, ?, 1)`
  ).bind(id, body.email, passwordHash, body.role, body.display_name);

  const accessInserts = patients.results.map((p) =>
    c.env.DB.prepare(
      `INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), id, p.id, body.role, adminId)
  );

  await c.env.DB.batch([insertUser, ...accessInserts]);

  return c.json({
    user: { id, email: body.email, role: body.role, display_name: body.display_name, must_change_pw: 1 },
    temp_password: tempPassword,
  }, 201);
});

// PUT /api/admin/users/:id — update role
adminRoutes.put("/users/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await c.env.DB.prepare(
    "SELECT id FROM users WHERE id = ?"
  ).bind(id).first();

  if (!existing) return c.json({ error: "User not found" }, 404);

  const body = await c.req.json<{
    role?: string;
    display_name?: string;
  }>();

  if (body.role !== undefined) {
    const validRoles = ["admin", "viewer"];
    if (!validRoles.includes(body.role)) {
      return c.json({ error: `role must be one of: ${validRoles.join(", ")}` }, 400);
    }
  }

  const now = new Date().toISOString();

  // Build dynamic UPDATE — only set fields present in the request body
  const setClauses: string[] = ["updated_at = ?"];
  const bindValues: unknown[] = [now];

  if (body.role !== undefined) {
    setClauses.unshift("role = ?");
    bindValues.unshift(body.role);
  }
  if (body.display_name !== undefined) {
    setClauses.unshift("display_name = ?");
    bindValues.unshift(body.display_name);
  }

  bindValues.push(id);

  await c.env.DB.prepare(
    `UPDATE users SET ${setClauses.join(", ")} WHERE id = ?`
  ).bind(...bindValues).run();

  const user = await c.env.DB.prepare(
    "SELECT id, email, role, display_name, is_super_admin, must_change_pw, created_at, updated_at FROM users WHERE id = ?"
  ).bind(id).first();

  return c.json({ user });
});

// DELETE /api/admin/users/:id — remove user (cascades via FK)
adminRoutes.delete("/users/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await c.env.DB.prepare(
    "SELECT id, is_super_admin FROM users WHERE id = ?"
  ).bind(id).first<{ id: string; is_super_admin: number }>();

  if (!existing) return c.json({ error: "User not found" }, 404);

  if (existing.is_super_admin === 1) {
    return c.json({ error: "Forbidden: cannot delete the super admin" }, 403);
  }

  // Cascade-delete related records first (refresh_tokens and user_patient_access cascade via FK)
  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();

  return c.json({ ok: true });
});

// POST /api/admin/users/:id/reset-pw — set temp password, set must_change_pw=1
adminRoutes.post("/users/:id/reset-pw", async (c) => {
  const id = c.req.param("id");

  const existing = await c.env.DB.prepare(
    "SELECT id FROM users WHERE id = ?"
  ).bind(id).first();

  if (!existing) return c.json({ error: "User not found" }, 404);

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    UPDATE users SET password_hash = ?, must_change_pw = 1, updated_at = ?
    WHERE id = ?
  `).bind(passwordHash, now, id).run();

  return c.json({ temp_password: tempPassword, must_change_pw: 1 });
});

// GET /api/admin/export — D1 JSON dump; dual auth: X-API-Key OR JWT cookie
adminRoutes.get("/export", async (c) => {
  // Try API key first
  const apiKey = c.req.header("x-api-key");
  if (apiKey) {
    const keyHash = await sha256hex(apiKey);
    const setting = await c.env.DB.prepare(
      "SELECT value FROM system_settings WHERE key = 'backup_api_key_hash'"
    ).first<{ value: string }>();

    if (!setting || !(await constantTimeEqual(setting.value, keyHash))) {
      return c.json({ error: "Invalid API key" }, 401);
    }
  } else {
    // Fall back to JWT cookie auth
    const token = getCookie(c, "access_token");
    if (!token) {
      return c.json({ error: "Authentication required" }, 401);
    }
    try {
      const payload = await verifyAccessToken(token, c.env.JWT_SECRET);
      const row = await c.env.DB.prepare(
        "SELECT is_super_admin FROM users WHERE id = ?"
      ).bind(payload.sub).first<{ is_super_admin: number }>();
      if (!row?.is_super_admin) {
        return c.json({ error: "Forbidden: super admin required" }, 403);
      }
    } catch {
      return c.json({ error: "Invalid or expired token" }, 401);
    }
  }

  const data = await collectBackupData(c.env.DB, c.env.ENVIRONMENT ?? "unknown");
  return c.json(data);
});

// POST /api/admin/documents/backfill-sha256
// Computes SHA-256 from R2 for all documents where sha256 IS NULL.
// Super-admin only. Safe to call multiple times (already-hashed docs excluded by the query).
adminRoutes.post("/documents/backfill-sha256", async (c) => {
  const docs = await c.env.DB.prepare(
    "SELECT id, r2_key FROM documents WHERE sha256 IS NULL AND is_deleted = 0"
  ).all<{ id: string; r2_key: string }>();

  let updated = 0;
  let skipped = 0;

  for (const doc of docs.results) {
    const obj = await c.env.BUCKET.get(doc.r2_key);
    if (!obj) {
      skipped++;
      continue;
    }

    const bytes = await obj.arrayBuffer();
    const hashBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const sha256 = Array.from(hashBytes, (b) => b.toString(16).padStart(2, "0")).join("");

    try {
      await c.env.DB.prepare(
        "UPDATE documents SET sha256 = ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(sha256, doc.id).run();
      updated++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("UNIQUE constraint")) {
        // Unique index violation: another document already has this hash (content duplicate)
        skipped++;
      } else {
        throw err;
      }
    }
  }

  return c.json({ updated, skipped });
});

// Helper: Generate a random temp password (bias-free via rejection sampling)
function generateTempPassword(length = 16): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length * 2)); // extra for rejection
  let result = "";
  for (let i = 0; i < bytes.length && result.length < length; i++) {
    if (bytes[i] < 248) result += charset[bytes[i] % charset.length]; // 248 = 62*4, no bias
  }
  // Fallback: if rejection sampling left us short (extremely unlikely), recurse
  if (result.length < length) return generateTempPassword(length);
  return result;
}
