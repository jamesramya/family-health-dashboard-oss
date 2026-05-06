import type { Context, Next } from "hono";

export async function loggerMiddleware(c: Context, next: Next) {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(JSON.stringify({
    event: "api_request",
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration_ms: ms,
    user: c.get("user")?.sub ?? "anonymous",
  }));
}
