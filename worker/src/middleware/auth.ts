import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { verifyAccessToken } from "../services/jwt";

export async function authMiddleware(c: Context, next: Next) {
  // Allow API-key auth to pass through to the route handler (e.g. /api/admin/export)
  if (c.req.header("x-api-key")) return next();
  const token = getCookie(c, "access_token");
  if (!token) return c.json({ error: "Authentication required" }, 401);
  try {
    c.set("user", await verifyAccessToken(token, c.env.JWT_SECRET));
    await next();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.log("[auth.middleware]", JSON.stringify({ jwt_present: true, reason }));
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}
