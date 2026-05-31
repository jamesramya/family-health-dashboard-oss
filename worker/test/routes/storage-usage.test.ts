import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedViewer, seedPatient, seedDocument } from "../helpers/setup-db";
import { createAccessToken } from "../../src/services/jwt";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";
const TEST_ENV = { ...env, JWT_SECRET };

async function adminToken(id = "admin-1", email = "admin@test.com") {
  return createAccessToken({ sub: id, role: "admin", email }, JWT_SECRET);
}

describe("GET /api/storage/usage", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/storage/usage", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });

  it("returns 200 with usage shape for authenticated user", async () => {
    await seedDocument(env.DB, { id: "doc-1", type: "blood_report", file_size_bytes: 50000 });
    await seedDocument(env.DB, { id: "doc-2", type: "scan", file_size_bytes: 30000 });
    await seedDocument(env.DB, { id: "doc-3", type: "prescription", file_size_bytes: 10000, is_deleted: 1 });

    const token = await adminToken();
    const res = await app.request(
      "/api/storage/usage",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();

    expect(body).toHaveProperty("total_bytes");
    expect(body).toHaveProperty("quota_bytes", 1073741824);
    expect(body).toHaveProperty("by_category");
    expect(body.by_category).toHaveProperty("documents");
    expect(body.by_category).toHaveProperty("scans");
    expect(body.by_category).toHaveProperty("photos");

    // D1 aggregation: 50000 for blood_report, 30000 for scan (deleted doc excluded)
    expect(body.by_category.documents).toBeGreaterThanOrEqual(50000);
    expect(body.by_category.scans).toBeGreaterThanOrEqual(30000);
    expect(body.by_category.photos).toBe(0);
    // total_bytes >= D1 total (R2 walk adds more in prod; test environment returns 0 from BUCKET)
    expect(body.total_bytes).toBeGreaterThanOrEqual(80000);
  });

  it("excludes deleted documents from byte counts", async () => {
    await seedDocument(env.DB, { id: "doc-deleted", type: "blood_report", file_size_bytes: 99999, is_deleted: 1 });

    const token = await adminToken();
    const res = await app.request(
      "/api/storage/usage",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.by_category.documents).toBe(0);
  });
});
