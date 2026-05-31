import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedPatient } from "../helpers/setup-db";
import { createAccessToken } from "../../src/services/jwt";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";
const TEST_ENV = { ...env, JWT_SECRET };

async function adminToken(id = "admin-1", email = "admin@test.com") {
  return createAccessToken({ sub: id, role: "admin", email }, JWT_SECRET);
}

describe("GET /api/account/export", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/account/export", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });

  it("returns 200 with attachment headers for authenticated user", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/account/export",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);

    const contentType = res.headers.get("Content-Type") ?? "";
    const contentDisposition = res.headers.get("Content-Disposition") ?? "";

    // Accept either JSON bundle or zip
    expect(
      contentType.includes("application/json") || contentType.includes("application/zip") || contentType.includes("application/octet-stream")
    ).toBe(true);

    expect(contentDisposition).toMatch(/attachment/);
    expect(contentDisposition).toMatch(/filename=/);
    expect(contentDisposition).toMatch(/family-health-export/);
  });

  it("response body includes manifest with exported_at and user_id", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/account/export",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    const parsed = JSON.parse(text);
    expect(parsed).toHaveProperty("manifest");
    expect(parsed.manifest).toHaveProperty("exported_at");
    expect(parsed.manifest).toHaveProperty("user_id", "admin-1");
    expect(parsed.manifest).toHaveProperty("version", "1");
    expect(parsed.manifest).toHaveProperty("patient_count");
  });
});
