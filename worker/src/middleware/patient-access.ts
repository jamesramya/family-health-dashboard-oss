import type { Context, Next } from "hono";

export async function patientAccessMiddleware(c: Context, next: Next) {
  const user = c.get("user");
  const pid = c.req.param("pid");
  if (!pid) return c.json({ error: "Patient ID required" }, 400);

  const row = await c.env.DB.prepare(
    "SELECT is_super_admin FROM users WHERE id = ?"
  ).bind(user.sub).first();

  if (row?.is_super_admin) {
    c.set("patientId", pid);
    c.set("patientRole", "admin");
    await next();
    return;
  }

  const access = await c.env.DB.prepare(
    "SELECT role FROM user_patient_access WHERE user_id = ? AND patient_id = ?"
  ).bind(user.sub, pid).first();

  if (!access) return c.json({ error: "No access to this patient" }, 403);

  c.set("patientId", pid);
  c.set("patientRole", access.role);
  await next();
}
