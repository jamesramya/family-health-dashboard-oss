import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedPatient, seedDocument } from "../helpers/setup-db";
import { createAccessToken } from "../../src/services/jwt";

// NOTE: this file does NOT use the real miniflare R2 binding.
//
// `@cloudflare/vitest-pool-workers` (tested on 0.10.10 and 0.12.21) trips an
// isolated-storage reset assertion (`Expected .sqlite, got .sqlite-shm`) on
// the first R2 write inside any describe block — miniflare's R2 SQLite runs
// in WAL mode, producing sidecar files the reset refuses. Skipping, warming
// via beforeAll, or splitting into its own file all fail the same way (see
// MEMORY: `project_vitest_pool_r2_bug.md` and closed PR #33).
//
// Workaround: stub the BUCKET binding with an in-memory map. The route
// handler only calls `BUCKET.get()` and streams `.body`, so the stub covers
// the real code path. When the pool bug is fixed upstream, replace with the
// real binding and remove this comment.

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";

const R2_KEY = "patients/patient-1/documents/doc-1/report.pdf";
const PDF_BYTES = new Uint8Array([37, 80, 68, 70]); // %PDF

type StubObject = { body: ReadableStream<Uint8Array>; size: number };

function makeBucketStub(initial: Map<string, Uint8Array>) {
  return {
    async get(key: string): Promise<StubObject | null> {
      const bytes = initial.get(key);
      if (!bytes) return null;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
      return { body: stream, size: bytes.byteLength };
    },
  };
}

async function adminToken(id = "admin-1", email = "admin@test.com") {
  return createAccessToken({ sub: id, role: "admin", email }, JWT_SECRET);
}

describe("GET /api/patients/:pid/documents/:id/file", () => {
  let TEST_ENV: typeof env;

  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
    await seedDocument(env.DB, { id: "doc-1", title: "Blood Report Jan", r2_key: R2_KEY });

    const objects = new Map<string, Uint8Array>([[R2_KEY, PDF_BYTES]]);
    TEST_ENV = { ...env, JWT_SECRET, BUCKET: makeBucketStub(objects) as unknown as R2Bucket };
  });

  it("streams file with correct Content-Type", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/documents/doc-1/file",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Length")).toBe(String(PDF_BYTES.byteLength));
  });

  it("sets Content-Disposition attachment when download=1", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/documents/doc-1/file?download=1",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(res.headers.get("Content-Disposition")).toContain("Blood Report Jan");
  });

  it("does not set Content-Disposition without download param", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/documents/doc-1/file",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBeNull();
  });

  it("returns 404 for non-existent document", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/documents/nope/file",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV,
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when document row exists but R2 object is missing", async () => {
    await seedDocument(env.DB, { id: "doc-orphan", r2_key: "does/not/exist.pdf" });
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/documents/doc-orphan/file",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV,
    );
    expect(res.status).toBe(404);
  });
});
