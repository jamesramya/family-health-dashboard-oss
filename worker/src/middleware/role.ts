import type { Context, Next } from "hono";

export function requireRole(...roles: string[]) {
  return async (c: Context, next: Next) => {
    const user = c.get("user");
    if (!user || !roles.includes(user.role)) return c.json({ error: "Forbidden" }, 403);
    await next();
  };
}
