import type { Context } from "hono";

// Hono's c.executionCtx getter throws when no ExecutionContext was provided
// (e.g. via app.request() in unit tests). Wrap every waitUntil call through
// this helper so tests don't blow up before the route handler runs.
export function safeWaitUntil(c: Context, prom: Promise<unknown>): void {
  try {
    c.executionCtx.waitUntil(prom);
  } catch {
    void prom;
  }
}

// Returns a no-op ExecutionContext when the real one is unavailable (unit tests).
export function getSafeExecCtx(c: Context): ExecutionContext {
  try {
    return c.executionCtx;
  } catch {
    return { waitUntil: (p: Promise<unknown>) => void p, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  }
}
