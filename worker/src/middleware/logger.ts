import type { Context, Next } from "hono";

function redactAuthHeader(header: string | undefined): string | undefined {
  if (!header) return undefined;
  return header.replace(/^(Bearer mcp_)[0-9a-f]+$/i, "$1[REDACTED]");
}

export async function loggerMiddleware(c: Context, next: Next) {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  const authHeader = c.req.header("Authorization");
  console.log(JSON.stringify({
    event: "api_request",
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration_ms: ms,
    user: c.get("user")?.sub ?? "anonymous",
    ...(authHeader ? { authorization: redactAuthHeader(authHeader) } : {}),
  }));
}
