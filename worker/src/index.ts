import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Bindings } from "./types";
import { loggerMiddleware } from "./middleware/logger";
import { securityHeaders } from "./middleware/security-headers";
import { setupRoutes } from "./routes/setup";
import { authRoutes } from "./routes/auth";
import { authMiddleware } from "./middleware/auth";
import { requireSuperAdmin } from "./middleware/role";
import { patientAccessMiddleware } from "./middleware/patient-access";
import { patientRoutes } from "./routes/patients";
import { documentRoutes } from "./routes/documents";
import { bloodWorkRoutes } from "./routes/blood-work";
import { dashboardRoutes } from "./routes/dashboard";
import { vitalsRoutes } from "./routes/vitals";
import { medicationsRoutes } from "./routes/medications";
import { scansRoutes } from "./routes/scans";
import { culturesRoutes } from "./routes/cultures";
import { notesRoutes } from "./routes/notes";
import { adminRoutes } from "./routes/admin";
import { aiRoutes } from "./routes/ai";
import { adminTestReviewRoutes } from "./routes/admin-test-review";
import { publicShareRoutes, shareLinkAdminRoutes } from "./routes/share";
import { storageRoutes } from "./routes/storage";
import { accountRoutes } from "./routes/account";
import { handleScheduled } from "./scheduled";
import { oauthClientRoutes } from "./routes/tokens";
import { externalApiRoutes } from "./routes/external-api";
import { mcpApp, mcpDiscoveryRoute } from "./routes/mcp";
import { openApiRoute } from "./routes/openapi";
import { oauthWellKnown, oauthRoutes, oauthApiRoutes } from "./routes/oauth";

const app = new Hono<{ Bindings: Bindings }>();

// Structured logging — must be first middleware
app.use("*", loggerMiddleware);

// JWT_SECRET is required for both JWT signing and AI key encryption (HKDF → AES-GCM).
// Cloudflare plaintext secrets are undefined at runtime when absent — fail loudly.
app.use("*", async (c, next) => {
  if (!c.env.JWT_SECRET) throw new Error("Missing required secret: JWT_SECRET");
  await next();
});

// Single CORS middleware — public endpoints get wildcard/no-credentials; SPA routes get cookie-credentialed.
// Two separate app.use() calls would both execute for matching paths; the second would overwrite the first.
app.use("*", (c, next) => {
  const path = c.req.path;
  if (
    path.startsWith("/api/external/") ||
    path === "/mcp" ||
    path === "/openapi.json" ||
    path.startsWith("/.well-known/") ||
    path.startsWith("/oauth/")
  ) {
    return cors({ origin: "*", credentials: false })(c, next);
  }
  return cors({
    origin: (_, c) => c.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  })(c, next);
});

// Security headers on all routes
app.use("*", securityHeaders);

app.get("/api/health", async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1").first();
    return c.json({ status: "ok", db: "connected" });
  } catch {
    return c.json({ status: "degraded", db: "error" }, 503);
  }
});

// Discovery + OpenAPI (no auth)
app.route("", mcpDiscoveryRoute);
app.route("/.well-known", oauthWellKnown);
app.route("", openApiRoute);
app.route("/oauth", oauthRoutes);

// OAuth API routes (cookie-auth, SPA callers)
app.route("/api/oauth", oauthApiRoutes);

// Public routes
app.route("/api", setupRoutes);
app.route("/api/auth", authRoutes);
app.route("/api/share", publicShareRoutes);

// All /api/patients routes require auth
app.use("/api/patients", authMiddleware);
app.use("/api/patients/*", authMiddleware);

// Patient listing/creation (auth only, no patient scope)
app.route("/api/patients", patientRoutes);

// Patient-scoped routes also require patient access middleware
// Note: authMiddleware already ran from the rule above
app.use("/api/patients/:pid/*", patientAccessMiddleware);
app.route("/api/patients/:pid/dashboard", dashboardRoutes);
app.route("/api/patients/:pid/documents", documentRoutes);
app.route("/api/patients/:pid/blood-work", bloodWorkRoutes);
app.route("/api/patients/:pid/vitals", vitalsRoutes);
app.route("/api/patients/:pid/medications", medicationsRoutes);
app.route("/api/patients/:pid/scans", scansRoutes);
app.route("/api/patients/:pid/cultures", culturesRoutes);
app.route("/api/patients/:pid/notes", notesRoutes);

// OAuth authorized clients (cookie-auth applied inside oauthClientRoutes)
app.route("/api/user/oauth-clients", oauthClientRoutes);

// External API (Bearer auth applied inside externalApiRoutes)
app.route("/api/external", externalApiRoutes);

// MCP endpoint (Bearer auth applied inside mcpApp)
app.route("/mcp", mcpApp);

// Storage usage (auth required)
app.use("/api/storage/*", authMiddleware);
app.route("/api/storage", storageRoutes);

// Account export (auth required)
app.use("/api/account/*", authMiddleware);
app.route("/api/account", accountRoutes);

// AI capabilities (auth required)
app.use("/api/ai/*", authMiddleware);
app.route("/api/ai", aiRoutes);

// Admin routes (require super admin)
app.use("/api/admin/*", authMiddleware);
app.use("/api/admin/*", requireSuperAdmin);
app.route("/api/admin", adminRoutes);
app.route("/api/admin/test-review", adminTestReviewRoutes);

// Share link admin routes (require auth + super admin)
app.use("/api/share-links", authMiddleware);
app.use("/api/share-links", requireSuperAdmin);
app.use("/api/share-links/*", authMiddleware);
app.use("/api/share-links/*", requireSuperAdmin);
app.route("/api/share-links", shareLinkAdminRoutes);

// Named export of the Hono app — used by tests via app.request()
export { app };

// Cloudflare Workers module format: default export with fetch + scheduled
export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
};

// Named export for Cloudflare Workflows
export { DocumentExtractionWorkflow } from "./workflows/document-extraction";
