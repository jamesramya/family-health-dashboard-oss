import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedViewer, seedPatient, seedPat } from "../helpers/setup-db";
import { sha256hex } from "../../src/services/crypto";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";

// Deterministic raw tokens for testing
const RAW_TOKEN_ADMIN = "mcp_" + "a".repeat(64);
const RAW_TOKEN_WRITE = "mcp_" + "c".repeat(64);
const RAW_TOKEN_VIEWER = "mcp_" + "d".repeat(64);

const TEST_ENV = {
  ...env,
  JWT_SECRET,
  RATE_LIMITER: { limit: async () => ({ success: true }) },
};

async function authHeaders(rawToken: string) {
  return { Authorization: `Bearer ${rawToken}` };
}

describe("GET /api/external/patients", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
    const hash = await sha256hex(RAW_TOKEN_ADMIN);
    await seedPat(env.DB, { token_hash: hash, user_id: "admin-1", scopes: "read" });
  });

  it("returns patient list for valid token", async () => {
    const res = await app.request(
      "/api/external/patients",
      { headers: await authHeaders(RAW_TOKEN_ADMIN) },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ patients: { id: string }[] }>();
    expect(Array.isArray(body.patients)).toBe(true);
    expect(body.patients.some((p) => p.id === "patient-1")).toBe(true);
  });

  it("excludes is_deleted=1 patients", async () => {
    // Mark patient-1 as deleted
    await env.DB.prepare("UPDATE patient SET is_deleted = 1 WHERE id = 'patient-1'").run();
    const res = await app.request(
      "/api/external/patients",
      { headers: await authHeaders(RAW_TOKEN_ADMIN) },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ patients: { id: string }[] }>();
    expect(body.patients.find((p) => p.id === "patient-1")).toBeUndefined();
  });
});

describe("GET /api/external/patients/:id/vitals", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
    const hash = await sha256hex(RAW_TOKEN_ADMIN);
    await seedPat(env.DB, { token_hash: hash, user_id: "admin-1", scopes: "read" });
  });

  it("returns vitals for accessible patient", async () => {
    const res = await app.request(
      "/api/external/patients/patient-1/vitals",
      { headers: await authHeaders(RAW_TOKEN_ADMIN) },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ vitals: unknown[] }>();
    expect(Array.isArray(body.vitals)).toBe(true);
  });

  it("returns 403 for inaccessible patient", async () => {
    // Seed a second patient not granted to admin-1 via user_patient_access
    // Note: admin-1 is super_admin so gets all patients — use a viewer token instead
    await seedViewer(env.DB);
    // Seed a second patient (no access row for viewer)
    await env.DB.prepare(
      "INSERT INTO patient (id, name, date_of_birth, gender, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind("patient-2", "Other Patient", "1980-01-01", "male", "admin-1", "admin-1").run();
    // Seed a PAT for viewer-1 (no access to patient-2)
    const hash = await sha256hex("mcp_" + "e".repeat(64));
    await seedPat(env.DB, {
      id: "pat-viewer",
      token_hash: hash,
      user_id: "viewer-1",
      scopes: "read",
    });
    const res = await app.request(
      "/api/external/patients/patient-2/vitals",
      { headers: { Authorization: `Bearer mcp_${"e".repeat(64)}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("patient_access_denied");
  });
});

describe("POST /api/external/patients/:id/vitals (log_vital)", () => {
  let writeHash: string;

  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);

    // Read-only token for admin-1
    const readHash = await sha256hex(RAW_TOKEN_ADMIN);
    await seedPat(env.DB, { id: "pat-read", name: "Read Token", token_hash: readHash, user_id: "admin-1", scopes: "read" });

    // Write token for admin-1
    writeHash = await sha256hex(RAW_TOKEN_WRITE);
    await seedPat(env.DB, { id: "pat-write", name: "Write Token", token_hash: writeHash, user_id: "admin-1", scopes: "read,write" });
  });

  it("dry_run=true returns dry_run=true, preview, and confirmation_id", async () => {
    const res = await app.request(
      "/api/external/patients/patient-1/vitals",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_WRITE)), "Content-Type": "application/json" },
        body: JSON.stringify({ type: "bp", value_primary: 120, value_secondary: 80, dry_run: true }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ dry_run: boolean; preview: unknown; confirmation_id: string }>();
    expect(body.dry_run).toBe(true);
    expect(body.preview).toBeTruthy();
    expect(typeof body.confirmation_id).toBe("string");
  });

  it("write without confirmation_id returns 409 confirmation_id_required", async () => {
    const res = await app.request(
      "/api/external/patients/patient-1/vitals",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_WRITE)), "Content-Type": "application/json" },
        body: JSON.stringify({ type: "bp", value_primary: 120, value_secondary: 80 }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(409);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("confirmation_id_required");
  });

  it("write with valid confirmation_id returns 201 with id and created_at", async () => {
    // First: dry run to get confirmation_id
    const dryRes = await app.request(
      "/api/external/patients/patient-1/vitals",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_WRITE)), "Content-Type": "application/json" },
        body: JSON.stringify({ type: "weight", value_primary: 65, dry_run: true }),
      },
      TEST_ENV
    );
    const { confirmation_id } = await dryRes.json<{ confirmation_id: string }>();

    // Then commit with the same payload + confirmation_id
    const res = await app.request(
      "/api/external/patients/patient-1/vitals",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_WRITE)), "Content-Type": "application/json" },
        body: JSON.stringify({ type: "weight", value_primary: 65, confirmation_id }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(201);
    const body = await res.json<{ id: string; created_at: string }>();
    expect(typeof body.id).toBe("string");
    expect(typeof body.created_at).toBe("string");
  });

  it("write with expired/consumed confirmation_id returns 409 confirmation_not_found", async () => {
    const res = await app.request(
      "/api/external/patients/patient-1/vitals",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_WRITE)), "Content-Type": "application/json" },
        body: JSON.stringify({ type: "bp", value_primary: 120, value_secondary: 80, confirmation_id: "does-not-exist" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(409);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("confirmation_not_found");
  });

  it("read-only token write attempt returns 403 write_scope_required", async () => {
    const res = await app.request(
      "/api/external/patients/patient-1/vitals",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_ADMIN)), "Content-Type": "application/json" },
        body: JSON.stringify({ type: "bp", value_primary: 120, value_secondary: 80, dry_run: true }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("write_scope_required");
  });

  it("viewer-role token write attempt returns 403 admin_role_required", async () => {
    await seedViewer(env.DB);
    // Grant viewer-1 access to patient-1 with role 'viewer'
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    ).bind("acc-viewer", "viewer-1", "patient-1", "viewer", "admin-1").run();

    // Seed a read,write PAT for viewer-1
    const hash = await sha256hex(RAW_TOKEN_VIEWER);
    await seedPat(env.DB, {
      id: "pat-viewer-write",
      token_hash: hash,
      user_id: "viewer-1",
      scopes: "read,write",
    });

    const res = await app.request(
      "/api/external/patients/patient-1/vitals",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_VIEWER)), "Content-Type": "application/json" },
        body: JSON.stringify({ type: "bp", value_primary: 120, value_secondary: 80, dry_run: true }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("admin_role_required");
  });
});

describe("POST /api/external/patients/:id/vitals — date-only measured_at", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
    const hash = await sha256hex(RAW_TOKEN_WRITE);
    await seedPat(env.DB, { id: "pat-write-2", name: "Write Token 2", token_hash: hash, user_id: "admin-1", scopes: "read,write" });
  });

  it("date-only measured_at: dry-run → commit round-trip succeeds without hash mismatch", async () => {
    const dryRes = await app.request(
      "/api/external/patients/patient-1/vitals",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_WRITE)), "Content-Type": "application/json" },
        body: JSON.stringify({ type: "bp", value_primary: 120, value_secondary: 80, measured_at: "2026-05-25", dry_run: true }),
      },
      TEST_ENV
    );
    expect(dryRes.status).toBe(200);
    const { confirmation_id } = await dryRes.json<{ confirmation_id: string }>();

    const res = await app.request(
      "/api/external/patients/patient-1/vitals",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_WRITE)), "Content-Type": "application/json" },
        body: JSON.stringify({ type: "bp", value_primary: 120, value_secondary: 80, measured_at: "2026-05-25", confirmation_id }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(201);
  });

  it("date-only measured_at: preview measured_at is a full ISO datetime on the given date", async () => {
    const dryRes = await app.request(
      "/api/external/patients/patient-1/vitals",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_WRITE)), "Content-Type": "application/json" },
        body: JSON.stringify({ type: "weight", value_primary: 65, measured_at: "2026-05-25", dry_run: true }),
      },
      TEST_ENV
    );
    expect(dryRes.status).toBe(200);
    const { preview } = await dryRes.json<{ preview: { measured_at: string } }>();
    expect(preview.measured_at).toMatch(/^2026-05-25T\d{2}:\d{2}:\d{2}/);
  });

  it("full ISO datetime measured_at passes through unchanged", async () => {
    const measuredAt = "2026-05-25T14:30:00.000Z";
    const dryRes = await app.request(
      "/api/external/patients/patient-1/vitals",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_WRITE)), "Content-Type": "application/json" },
        body: JSON.stringify({ type: "weight", value_primary: 65, measured_at: measuredAt, dry_run: true }),
      },
      TEST_ENV
    );
    expect(dryRes.status).toBe(200);
    const { preview } = await dryRes.json<{ preview: { measured_at: string } }>();
    expect(preview.measured_at).toBe(measuredAt);
  });

  it("midnight UTC measured_at: preview uses current time not T00:00:00Z", async () => {
    const dryRes = await app.request(
      "/api/external/patients/patient-1/vitals",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_WRITE)), "Content-Type": "application/json" },
        body: JSON.stringify({ type: "bp", value_primary: 130, value_secondary: 85, measured_at: "2026-05-25T00:00:00.000Z", dry_run: true }),
      },
      TEST_ENV
    );
    expect(dryRes.status).toBe(200);
    const { preview } = await dryRes.json<{ preview: { measured_at: string } }>();
    expect(preview.measured_at).toMatch(/^2026-05-25T/);
    expect(preview.measured_at).not.toMatch(/^2026-05-25T00:00:00/);
  });

  it("midnight UTC measured_at: dry-run → commit round-trip succeeds", async () => {
    const dryRes = await app.request(
      "/api/external/patients/patient-1/vitals",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_WRITE)), "Content-Type": "application/json" },
        body: JSON.stringify({ type: "glucose", value_primary: 5.5, measured_at: "2026-05-25T00:00:00.000Z", dry_run: true }),
      },
      TEST_ENV
    );
    expect(dryRes.status).toBe(200);
    const { confirmation_id } = await dryRes.json<{ confirmation_id: string }>();

    const res = await app.request(
      "/api/external/patients/patient-1/vitals",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_WRITE)), "Content-Type": "application/json" },
        body: JSON.stringify({ type: "glucose", value_primary: 5.5, measured_at: "2026-05-25T00:00:00.000Z", confirmation_id }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(201);
  });
});

describe("POST /api/external/patients/:id/medications (add_medication)", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
    const hash = await sha256hex(RAW_TOKEN_WRITE);
    await seedPat(env.DB, { id: "pat-write-med", name: "Write Token Med", token_hash: hash, user_id: "admin-1", scopes: "read,write" });
  });

  it("omitted start_date: dry-run returns preview with a valid date and commit succeeds", async () => {
    const dryRes = await app.request(
      "/api/external/patients/patient-1/medications",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_WRITE)), "Content-Type": "application/json" },
        body: JSON.stringify({ brand_name: "Aspirin", dosage: "100mg", form: "tablet", dry_run: true }),
      },
      TEST_ENV
    );
    expect(dryRes.status).toBe(200);
    const { preview, confirmation_id } = await dryRes.json<{ preview: { start_date: string }; confirmation_id: string }>();
    expect(preview.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const res = await app.request(
      "/api/external/patients/patient-1/medications",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_WRITE)), "Content-Type": "application/json" },
        body: JSON.stringify({ brand_name: "Aspirin", dosage: "100mg", form: "tablet", confirmation_id }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(201);
  });

  it("explicit start_date: dry-run → commit round-trip succeeds with provided date", async () => {
    const dryRes = await app.request(
      "/api/external/patients/patient-1/medications",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_WRITE)), "Content-Type": "application/json" },
        body: JSON.stringify({ brand_name: "Metformin", dosage: "500mg", form: "tablet", start_date: "2026-05-01", dry_run: true }),
      },
      TEST_ENV
    );
    expect(dryRes.status).toBe(200);
    const { preview, confirmation_id } = await dryRes.json<{ preview: { start_date: string }; confirmation_id: string }>();
    expect(preview.start_date).toBe("2026-05-01");

    const res = await app.request(
      "/api/external/patients/patient-1/medications",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_WRITE)), "Content-Type": "application/json" },
        body: JSON.stringify({ brand_name: "Metformin", dosage: "500mg", form: "tablet", start_date: "2026-05-01", confirmation_id }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(201);
  });
});

describe("POST /api/external/patients/:id/notes (add_note)", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
    const hash = await sha256hex(RAW_TOKEN_WRITE);
    await seedPat(env.DB, { id: "pat-write-note", name: "Write Token Note", token_hash: hash, user_id: "admin-1", scopes: "read,write" });
  });

  it("omitted visit_date: dry-run returns preview with a valid date and commit succeeds", async () => {
    const dryRes = await app.request(
      "/api/external/patients/patient-1/notes",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_WRITE)), "Content-Type": "application/json" },
        body: JSON.stringify({ summary: "Patient doing well", dry_run: true }),
      },
      TEST_ENV
    );
    expect(dryRes.status).toBe(200);
    const { preview, confirmation_id } = await dryRes.json<{ preview: { visit_date: string }; confirmation_id: string }>();
    expect(preview.visit_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const res = await app.request(
      "/api/external/patients/patient-1/notes",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_WRITE)), "Content-Type": "application/json" },
        body: JSON.stringify({ summary: "Patient doing well", confirmation_id }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(201);
  });

  it("explicit visit_date: dry-run → commit round-trip succeeds with provided date", async () => {
    const dryRes = await app.request(
      "/api/external/patients/patient-1/notes",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_WRITE)), "Content-Type": "application/json" },
        body: JSON.stringify({ visit_date: "2026-05-20", summary: "Follow-up visit", dry_run: true }),
      },
      TEST_ENV
    );
    expect(dryRes.status).toBe(200);
    const { preview, confirmation_id } = await dryRes.json<{ preview: { visit_date: string }; confirmation_id: string }>();
    expect(preview.visit_date).toBe("2026-05-20");

    const res = await app.request(
      "/api/external/patients/patient-1/notes",
      {
        method: "POST",
        headers: { ...(await authHeaders(RAW_TOKEN_WRITE)), "Content-Type": "application/json" },
        body: JSON.stringify({ visit_date: "2026-05-20", summary: "Follow-up visit", confirmation_id }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(201);
  });
});
