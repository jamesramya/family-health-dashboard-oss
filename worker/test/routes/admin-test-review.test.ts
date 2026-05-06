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

async function viewerToken() {
  return createAccessToken({ sub: "viewer-1", role: "viewer", email: "viewer@test.com" }, JWT_SECRET);
}

async function seedReviewDef(
  db: D1Database,
  opts: { id: string; canonicalKey: string; canonicalName: string; unit?: string; category?: string; needsReview?: number },
) {
  await db.prepare(
    `INSERT INTO test_definitions
       (id, canonical_key, canonical_name, label, unit, category, needs_review, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'admin-1', 'admin-1')`,
  ).bind(
    opts.id, opts.canonicalKey, opts.canonicalName, opts.canonicalName,
    opts.unit ?? "mmol/L", opts.category ?? "electrolytes",
    opts.needsReview ?? 0,
  ).run();
}

describe("GET /api/admin/test-review", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
  });

  it("rejects non-admin", async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role, display_name) VALUES ('v1','v@x.com','h','viewer','V')",
    ).run();
    const token = await viewerToken();
    const res = await app.request(
      "/api/admin/test-review",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
  });

  it("returns items with candidates", async () => {
    await seedReviewDef(env.DB, { id: "td-review", canonicalKey: "unknowntest", canonicalName: "Unknown Test", needsReview: 1 });
    await seedReviewDef(env.DB, { id: "td-sodium", canonicalKey: "sodium", canonicalName: "Sodium", needsReview: 0 });

    const token = await adminToken();
    const res = await app.request(
      "/api/admin/test-review",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.items.length).toBe(1);
    expect(body.items[0].id).toBe("td-review");
    expect(body.items[0].candidates.length).toBe(1);
    expect(body.items[0].candidates[0].id).toBe("td-sodium");
  });

  it("returns empty when no items need review", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/admin/test-review",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.items).toEqual([]);
  });
});

describe("POST /api/admin/test-review/:id/merge", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("merges source into target, reassigns readings, soft-deletes source", async () => {
    await seedReviewDef(env.DB, { id: "td-src", canonicalKey: "sodiumsrc", canonicalName: "Sodium Src", needsReview: 1 });
    await seedReviewDef(env.DB, { id: "td-tgt", canonicalKey: "sodium", canonicalName: "Sodium" });

    await env.DB.prepare(
      `INSERT INTO test_results (id, patient_id, test_def_id, date, value, flag, created_by, updated_by)
       VALUES ('tr-1','patient-1','td-src','2024-01-15', 140, 'NORMAL', 'admin-1','admin-1')`,
    ).run();

    const token = await adminToken();
    const res = await app.request(
      "/api/admin/test-review/td-src/merge",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ targetTestDefId: "td-tgt" }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.mergedInto).toBe("td-tgt");

    // Reading moved to target
    const reading = await env.DB.prepare("SELECT test_def_id FROM test_results WHERE id = 'tr-1'").first<any>();
    expect(reading.test_def_id).toBe("td-tgt");

    // Source is soft-deleted
    const src = await env.DB.prepare("SELECT is_deleted, needs_review FROM test_definitions WHERE id = 'td-src'").first<any>();
    expect(src.is_deleted).toBe(1);
    expect(src.needs_review).toBe(0);

    // Target has source name as alias
    const tgt = await env.DB.prepare("SELECT aliases FROM test_definitions WHERE id = 'td-tgt'").first<any>();
    const aliases: string[] = JSON.parse(tgt.aliases);
    expect(aliases).toContain("sodium src");
  });

  it("returns 404 for missing source", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/admin/test-review/nonexistent/merge",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ targetTestDefId: "td-tgt" }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/test-review/:id/confirm", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
  });

  it("clears needs_review and optionally renames", async () => {
    await seedReviewDef(env.DB, { id: "td-1", canonicalKey: "oldkey", canonicalName: "Old Name", needsReview: 1 });

    const token = await adminToken();
    const res = await app.request(
      "/api/admin/test-review/td-1/confirm",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ canonicalName: "Corrected Name" }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.canonical_key).toBe("correctedname");

    const row = await env.DB.prepare("SELECT needs_review, canonical_name, canonical_key FROM test_definitions WHERE id = 'td-1'").first<any>();
    expect(row.needs_review).toBe(0);
    expect(row.canonical_name).toBe("Corrected Name");
    expect(row.canonical_key).toBe("correctedname");
  });

  it("keeps name if canonicalName not provided", async () => {
    await seedReviewDef(env.DB, { id: "td-1", canonicalKey: "testname", canonicalName: "Test Name", needsReview: 1 });

    const token = await adminToken();
    const res = await app.request(
      "/api/admin/test-review/td-1/confirm",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(200);

    const row = await env.DB.prepare("SELECT canonical_name, needs_review FROM test_definitions WHERE id = 'td-1'").first<any>();
    expect(row.canonical_name).toBe("Test Name");
    expect(row.needs_review).toBe(0);
  });
});

describe("POST /api/admin/test-review/:id/delete", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("requires confirm flag", async () => {
    await seedReviewDef(env.DB, { id: "td-1", canonicalKey: "junk", canonicalName: "Junk", needsReview: 1 });

    const token = await adminToken();
    const res = await app.request(
      "/api/admin/test-review/td-1/delete",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "nope" }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(400);
  });

  it("soft-deletes definition and readings", async () => {
    await seedReviewDef(env.DB, { id: "td-1", canonicalKey: "junk", canonicalName: "Junk", needsReview: 1 });
    await env.DB.prepare(
      `INSERT INTO test_results (id, patient_id, test_def_id, date, value, flag, created_by, updated_by)
       VALUES ('tr-1','patient-1','td-1','2024-01-15', 99, 'HIGH', 'admin-1','admin-1')`,
    ).run();

    const token = await adminToken();
    const res = await app.request(
      "/api/admin/test-review/td-1/delete",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(200);

    const def = await env.DB.prepare("SELECT is_deleted, needs_review FROM test_definitions WHERE id = 'td-1'").first<any>();
    expect(def.is_deleted).toBe(1);
    expect(def.needs_review).toBe(0);

    const reading = await env.DB.prepare("SELECT is_deleted FROM test_results WHERE id = 'tr-1'").first<any>();
    expect(reading.is_deleted).toBe(1);
  });
});
