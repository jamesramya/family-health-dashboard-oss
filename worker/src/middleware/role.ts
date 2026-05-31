import type { Context, Next } from "hono";

export function requireRole(...roles: string[]) {
  return async (c: Context, next: Next) => {
    const user = c.get("user");
    if (!user || !roles.includes(user.role)) return c.json({ error: "Forbidden" }, 403);
    await next();
  };
}

export async function requireSuperAdmin(c: Context, next: Next) {
  // Allow API-key auth to pass through to the route handler (e.g. /api/admin/export)
  if (c.req.header("x-api-key")) return next();
  const user = c.get("user") as { sub: string } | undefined;
  if (!user) return c.json({ error: "Forbidden" }, 403);
  const row = await c.env.DB.prepare(
    "SELECT is_super_admin FROM users WHERE id = ?"
  ).bind(user.sub).first() as { is_super_admin: number } | null;
  if (row?.is_super_admin !== 1) return c.json({ error: "Forbidden: super admin required" }, 403);
  await next();
}
