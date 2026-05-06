import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Bindings } from "./types";
import { loggerMiddleware } from "./middleware/logger";
import { securityHeaders } from "./middleware/security-headers";
import { setupRoutes } from "./routes/setup";
import { authRoutes } from "./routes/auth";
import { authMiddleware } from "./middleware/auth";
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
import { handleScheduled } from "./scheduled";

const app = new Hono<{ Bindings: Bindings }>();

// Structured logging — must be first middleware
app.use("*", loggerMiddleware);

app.use("*", cors({
  origin: (_, c) => c.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true,
}));

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

// Public routes
app.route("/api", setupRoutes);
app.route("/api/auth", authRoutes);

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

// AI capabilities (auth required)
app.use("/api/ai/*", authMiddleware);
app.route("/api/ai", aiRoutes);

// Admin routes (require super admin)
app.use("/api/admin/*", authMiddleware);
app.route("/api/admin", adminRoutes);
app.route("/api/admin/test-review", adminTestReviewRoutes);

// Named export of the Hono app — used by tests via app.request()
export { app };

// Cloudflare Workers module format: default export with fetch + scheduled
export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
};

// Named export for Cloudflare Workflows
export { DocumentExtractionWorkflow } from "./workflows/document-extraction";
