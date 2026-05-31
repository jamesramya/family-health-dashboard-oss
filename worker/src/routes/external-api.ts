import { Hono } from "hono";
import { tokenAuthMiddleware, logAccess, type TokenUser, type TokenAuthVariables } from "../middleware/token-auth";
import { sha256hex } from "../services/crypto";
import { safeWaitUntil } from "../services/wait-until";
import type { Bindings } from "../types";
import {
  LogVitalParamsSchema,
  AddMedicationParamsSchema,
  AddNoteParamsSchema,
  DiscontinueMedicationParamsSchema,
  type VitalType,
} from "../schemas/external";

export const externalApiRoutes = new Hono<{ Bindings: Bindings; Variables: TokenAuthVariables }>();
externalApiRoutes.use("*", tokenAuthMiddleware);

function hasWriteScope(tokenUser: TokenUser): boolean {
  return tokenUser.scopes === "read,write";
}

// ─── Confirmation helpers ─────────────────────────────────────────────────────

async function createConfirmation(
  db: D1Database,
  tokenId: string,
  tool: string,
  payloadHash: string
): Promise<string> {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  await db
    .prepare(
      "INSERT INTO write_confirmations (id, token_id, tool, payload_hash, expires_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(id, tokenId, tool, payloadHash, expiresAt)
    .run();
  return id;
}

async function validateConfirmation(
  db: D1Database,
  confirmationId: string,
  tool: string,
  payloadHash: string
): Promise<{ ok: true } | { ok: false; error: string; status: 409 | 410 }> {
  const now = new Date().toISOString();
  await db.prepare("DELETE FROM write_confirmations WHERE expires_at < ?").bind(now).run();

  const row = await db
    .prepare("SELECT id, tool, payload_hash, expires_at FROM write_confirmations WHERE id = ?")
    .bind(confirmationId)
    .first<{ id: string; tool: string; payload_hash: string; expires_at: string }>();

  if (!row) {
    return { ok: false, error: "confirmation_not_found", status: 409 };
  }
  if (tool !== row.tool) {
    return { ok: false, error: "confirmation_tool_mismatch", status: 409 };
  }
  if (payloadHash !== row.payload_hash) {
    return { ok: false, error: "confirmation_payload_mismatch", status: 409 };
  }

  await db.prepare("DELETE FROM write_confirmations WHERE id = ?").bind(row.id).run();
  return { ok: true };
}

// ─── Unit defaults per vital type ────────────────────────────────────────────

const VITAL_UNIT: Record<VitalType, string> = {
  bp: "mmHg",
  glucose: "mmol/L",
  weight: "kg",
  heart_rate: "bpm",
  spo2: "%",
  temperature: "°C",
};

// ─── Patient access helpers ───────────────────────────────────────────────────

function findPatientAccess(
  tokenUser: TokenUser,
  patientId: string
): { patientId: string; role: string } | undefined {
  return tokenUser.accessiblePatients.find((p) => p.patientId === patientId);
}

// ─── GET /patients ─────────────────────────────────────────────────────────────

externalApiRoutes.get("/patients", async (c) => {
  const tokenUser = c.get("tokenUser");
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const userAgent = c.req.header("User-Agent") ?? null;

  if (tokenUser.accessiblePatients.length === 0) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, tool: "list_patients", kind: "read", statusCode: 200, ip, userAgent })
    );
    return c.json({ patients: [] });
  }

  const ids = tokenUser.accessiblePatients.map((p) => p.patientId);
  const placeholders = ids.map(() => "?").join(", ");

  const result = await c.env.DB.prepare(
    `SELECT id, name, date_of_birth, gender FROM patient WHERE is_deleted = 0 AND id IN (${placeholders})`
  )
    .bind(...ids)
    .all<{ id: string; name: string; date_of_birth: string; gender: string }>();

  safeWaitUntil(c,
    logAccess(c.env.DB, { tokenId: tokenUser.tokenId, tool: "list_patients", kind: "read", statusCode: 200, ip, userAgent })
  );

  return c.json({ patients: result.results });
});

// ─── GET /patients/:patientId/summary ─────────────────────────────────────────

externalApiRoutes.get("/patients/:patientId/summary", async (c) => {
  const tokenUser = c.get("tokenUser");
  const patientId = c.req.param("patientId");
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const userAgent = c.req.header("User-Agent") ?? null;

  const patientAccess = findPatientAccess(tokenUser, patientId);
  if (!patientAccess) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "get_patient_summary", kind: "read", statusCode: 403, errorCode: "patient_access_denied", ip, userAgent })
    );
    return c.json({ error: "patient_access_denied" }, 403);
  }

  const [patient, latestVitals, activeMedCount] = await Promise.all([
    c.env.DB.prepare("SELECT id, name, date_of_birth, gender FROM patient WHERE id = ? AND is_deleted = 0")
      .bind(patientId)
      .first<{ id: string; name: string; date_of_birth: string; gender: string }>(),

    c.env.DB.prepare(
      `SELECT v.id, v.type, v.value_primary, v.value_secondary, v.measured_at, v.unit, v.context
       FROM vital_readings v
       INNER JOIN (
         SELECT type, MAX(measured_at) AS max_at
         FROM vital_readings
         WHERE patient_id = ? AND is_deleted = 0
         GROUP BY type
       ) latest ON v.type = latest.type AND v.measured_at = latest.max_at
       WHERE v.patient_id = ? AND v.is_deleted = 0`
    )
      .bind(patientId, patientId)
      .all<{ id: string; type: string; value_primary: number; value_secondary: number | null; measured_at: string; unit: string; context: string | null }>(),

    c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM medications WHERE patient_id = ? AND is_deleted = 0 AND is_active = 1"
    )
      .bind(patientId)
      .first<{ count: number }>(),
  ]);

  if (!patient) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "get_patient_summary", kind: "read", statusCode: 404, errorCode: "not_found", ip, userAgent })
    );
    return c.json({ error: "not_found" }, 404);
  }

  safeWaitUntil(c,
    logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "get_patient_summary", kind: "read", statusCode: 200, ip, userAgent })
  );

  return c.json({
    patient,
    latest_vitals: latestVitals.results,
    active_medication_count: activeMedCount?.count ?? 0,
  });
});

// ─── GET /patients/:patientId/vitals ──────────────────────────────────────────

externalApiRoutes.get("/patients/:patientId/vitals", async (c) => {
  const tokenUser = c.get("tokenUser");
  const patientId = c.req.param("patientId");
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const userAgent = c.req.header("User-Agent") ?? null;

  const patientAccess = findPatientAccess(tokenUser, patientId);
  if (!patientAccess) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "get_vitals", kind: "read", statusCode: 403, errorCode: "patient_access_denied", ip, userAgent })
    );
    return c.json({ error: "patient_access_denied" }, 403);
  }

  const typeParam = c.req.query("type");
  const limitRaw = c.req.query("limit");
  const limitNum = limitRaw !== undefined ? Math.min(Number(limitRaw), 500) : 100;
  const limit = Number.isFinite(limitNum) && limitNum > 0 ? limitNum : 100;

  let sql =
    "SELECT id, type, value_primary, value_secondary, value_tertiary, measured_at, unit, context FROM vital_readings WHERE patient_id = ? AND is_deleted = 0";
  const params: unknown[] = [patientId];

  if (typeParam) {
    sql += " AND type = ?";
    params.push(typeParam);
  }

  sql += " ORDER BY measured_at DESC LIMIT ?";
  params.push(limit);

  const result = await c.env.DB.prepare(sql).bind(...params).all();

  safeWaitUntil(c,
    logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "get_vitals", kind: "read", statusCode: 200, ip, userAgent })
  );

  return c.json({ vitals: result.results });
});

// ─── GET /patients/:patientId/medications ─────────────────────────────────────

externalApiRoutes.get("/patients/:patientId/medications", async (c) => {
  const tokenUser = c.get("tokenUser");
  const patientId = c.req.param("patientId");
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const userAgent = c.req.header("User-Agent") ?? null;

  const patientAccess = findPatientAccess(tokenUser, patientId);
  if (!patientAccess) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "get_medications", kind: "read", statusCode: 403, errorCode: "patient_access_denied", ip, userAgent })
    );
    return c.json({ error: "patient_access_denied" }, 403);
  }

  const result = await c.env.DB.prepare(
    `SELECT m.id, m.brand_name, m.generic_name, m.dosage, m.form, m.start_date, m.end_date, m.reason
     FROM medications m
     WHERE m.patient_id = ? AND m.is_deleted = 0
     ORDER BY m.start_date DESC`
  )
    .bind(patientId)
    .all();

  safeWaitUntil(c,
    logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "get_medications", kind: "read", statusCode: 200, ip, userAgent })
  );

  return c.json({ medications: result.results });
});

// ─── GET /patients/:patientId/blood-work ──────────────────────────────────────

externalApiRoutes.get("/patients/:patientId/blood-work", async (c) => {
  const tokenUser = c.get("tokenUser");
  const patientId = c.req.param("patientId");
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const userAgent = c.req.header("User-Agent") ?? null;

  const patientAccess = findPatientAccess(tokenUser, patientId);
  if (!patientAccess) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "get_blood_work", kind: "read", statusCode: 403, errorCode: "patient_access_denied", ip, userAgent })
    );
    return c.json({ error: "patient_access_denied" }, 403);
  }

  const limitRaw = c.req.query("limit");
  const limitNum = limitRaw !== undefined ? Math.min(Number(limitRaw), 500) : 50;
  const limit = Number.isFinite(limitNum) && limitNum > 0 ? limitNum : 50;

  const result = await c.env.DB.prepare(
    `SELECT tr.id, tr.date AS tested_at, td.canonical_name AS test_name, td.label, tr.value, td.unit,
            td.ref_low AS ref_min, td.ref_high AS ref_max, tr.flag
     FROM test_results tr
     JOIN test_definitions td ON tr.test_def_id = td.id
     WHERE tr.patient_id = ? AND tr.is_deleted = 0 AND td.is_deleted = 0
     ORDER BY tr.date DESC
     LIMIT ?`
  )
    .bind(patientId, limit)
    .all();

  safeWaitUntil(c,
    logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "get_blood_work", kind: "read", statusCode: 200, ip, userAgent })
  );

  return c.json({ blood_work: result.results });
});

// ─── GET /patients/:patientId/notes ───────────────────────────────────────────

externalApiRoutes.get("/patients/:patientId/notes", async (c) => {
  const tokenUser = c.get("tokenUser");
  const patientId = c.req.param("patientId");
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const userAgent = c.req.header("User-Agent") ?? null;

  const patientAccess = findPatientAccess(tokenUser, patientId);
  if (!patientAccess) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "get_notes", kind: "read", statusCode: 403, errorCode: "patient_access_denied", ip, userAgent })
    );
    return c.json({ error: "patient_access_denied" }, 403);
  }

  const result = await c.env.DB.prepare(
    `SELECT id, visit_date, doctor_name, facility, diagnosis, summary, treatment_plan, created_at
     FROM clinical_notes
     WHERE patient_id = ? AND is_deleted = 0
     ORDER BY visit_date DESC`
  )
    .bind(patientId)
    .all();

  safeWaitUntil(c,
    logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "get_notes", kind: "read", statusCode: 200, ip, userAgent })
  );

  return c.json({ notes: result.results });
});

// ─── GET /patients/:patientId/scans ───────────────────────────────────────────

externalApiRoutes.get("/patients/:patientId/scans", async (c) => {
  const tokenUser = c.get("tokenUser");
  const patientId = c.req.param("patientId");
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const userAgent = c.req.header("User-Agent") ?? null;

  const patientAccess = findPatientAccess(tokenUser, patientId);
  if (!patientAccess) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "get_scans", kind: "read", statusCode: 403, errorCode: "patient_access_denied", ip, userAgent })
    );
    return c.json({ error: "patient_access_denied" }, 403);
  }

  const result = await c.env.DB.prepare(
    `SELECT id, scan_type, scan_date, body_area, findings_summary AS findings, impression, ordering_doctor AS radiologist, created_at
     FROM scan_findings
     WHERE patient_id = ? AND is_deleted = 0
     ORDER BY scan_date DESC`
  )
    .bind(patientId)
    .all();

  safeWaitUntil(c,
    logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "get_scans", kind: "read", statusCode: 200, ip, userAgent })
  );

  return c.json({ scans: result.results });
});

// ─── GET /patients/:patientId/cultures ────────────────────────────────────────

externalApiRoutes.get("/patients/:patientId/cultures", async (c) => {
  const tokenUser = c.get("tokenUser");
  const patientId = c.req.param("patientId");
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const userAgent = c.req.header("User-Agent") ?? null;

  const patientAccess = findPatientAccess(tokenUser, patientId);
  if (!patientAccess) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "get_cultures", kind: "read", statusCode: 403, errorCode: "patient_access_denied", ip, userAgent })
    );
    return c.json({ error: "patient_access_denied" }, 403);
  }

  const result = await c.env.DB.prepare(
    `SELECT id, specimen_type, collection_date, organism, sensitivities, comments AS notes, created_at
     FROM culture_results
     WHERE patient_id = ? AND is_deleted = 0
     ORDER BY collection_date DESC`
  )
    .bind(patientId)
    .all<{ id: string; specimen_type: string; collection_date: string | null; organism: string | null; sensitivities: string; notes: string | null; created_at: string }>();

  const cultures = result.results.map((r) => {
    let sensitivities: unknown[];
    try {
      sensitivities = r.sensitivities ? JSON.parse(r.sensitivities as string) : [];
    } catch {
      sensitivities = [];
    }
    return { ...r, sensitivities };
  });

  safeWaitUntil(c,
    logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "get_cultures", kind: "read", statusCode: 200, ip, userAgent })
  );

  return c.json({ cultures });
});

// ─── POST /patients/:patientId/vitals ─────────────────────────────────────────

externalApiRoutes.post("/patients/:patientId/vitals", async (c) => {
  const tokenUser = c.get("tokenUser");
  const patientId = c.req.param("patientId");
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const userAgent = c.req.header("User-Agent") ?? null;

  if (!hasWriteScope(tokenUser)) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "log_vital", kind: "write", statusCode: 403, errorCode: "write_scope_required", ip, userAgent })
    );
    return c.json({ error: "write_scope_required" }, 403);
  }

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    safeWaitUntil(c,logAccess(c.env.DB, {
      tokenId: c.get("tokenUser").tokenId,
      patientId: null,
      tool: "log_vital",
      kind: "write",
      statusCode: 400,
      errorCode: "invalid_body",
      ip: c.req.header("CF-Connecting-IP") ?? null,
      userAgent: c.req.header("User-Agent") ?? null,
    }));
    return c.json({ error: "invalid_body" }, 400);
  }

  const parsed = LogVitalParamsSchema.safeParse(rawBody);
  if (!parsed.success) {
    safeWaitUntil(c,logAccess(c.env.DB, {
      tokenId: c.get("tokenUser").tokenId,
      patientId: null,
      tool: "log_vital",
      kind: "write",
      statusCode: 400,
      errorCode: "invalid_body",
      ip: c.req.header("CF-Connecting-IP") ?? null,
      userAgent: c.req.header("User-Agent") ?? null,
    }));
    return c.json({ error: "invalid_body", details: parsed.error.flatten() }, 400);
  }

  const body = parsed.data;

  const patientAccess = findPatientAccess(tokenUser, patientId);
  if (!patientAccess) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "log_vital", kind: "write", statusCode: 403, errorCode: "patient_access_denied", ip, userAgent })
    );
    return c.json({ error: "patient_access_denied" }, 403);
  }

  if (patientAccess.role !== "admin") {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "log_vital", kind: "write", statusCode: 403, errorCode: "admin_role_required", ip, userAgent })
    );
    return c.json({ error: "admin_role_required" }, 403);
  }

  const measuredAt = (() => {
    if (!body.measured_at) return new Date().toISOString();
    if (/^\d{4}-\d{2}-\d{2}$/.test(body.measured_at)) {
      const now = new Date();
      const [y, m, d] = body.measured_at.split('-').map(Number);
      now.setUTCFullYear(y, m - 1, d);
      return now.toISOString();
    }
    // LLMs construct midnight UTC (T00:00:00Z) when only the date is known.
    // Replace the time component with the current UTC time on that date.
    const parsed = new Date(body.measured_at);
    if (parsed.getUTCHours() === 0 && parsed.getUTCMinutes() === 0 && parsed.getUTCSeconds() === 0) {
      const now = new Date();
      now.setUTCFullYear(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
      return now.toISOString();
    }
    return body.measured_at;
  })();
  // Exclude auto-generated measured_at from the hash — it changes between the dry-run and
  // commit calls when the client doesn't supply it, causing a spurious hash mismatch.
  const canonicalBody: Record<string, unknown> = {
    type: body.type,
    value_primary: body.value_primary,
    value_secondary: body.value_secondary ?? null,
    ...(body.measured_at !== undefined ? { measured_at: body.measured_at } : {}),
  };
  const payloadHash = await sha256hex(JSON.stringify(canonicalBody));

  if (body.dry_run === true) {
    const confirmationId = await createConfirmation(c.env.DB, tokenUser.tokenId, "log_vital", payloadHash);

    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "log_vital", kind: "dry-run", statusCode: 200, ip, userAgent })
    );

    return c.json({
      dry_run: true,
      preview: { type: body.type, value_primary: body.value_primary, value_secondary: body.value_secondary ?? null, measured_at: measuredAt, patient_id: patientId },
      confirmation_id: confirmationId,
    });
  }

  if (!body.confirmation_id) {
    safeWaitUntil(c,logAccess(c.env.DB, {
      tokenId: tokenUser.tokenId,
      patientId,
      tool: "log_vital",
      kind: "write",
      statusCode: 409,
      errorCode: "confirmation_id_required",
      ip,
      userAgent,
    }));
    return c.json({ error: "confirmation_id_required" }, 409);
  }

  const validation = await validateConfirmation(c.env.DB, body.confirmation_id, "log_vital", payloadHash);
  if (!validation.ok) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "log_vital", kind: "write", statusCode: validation.status, errorCode: validation.error, ip, userAgent })
    );
    return c.json({ error: validation.error }, validation.status);
  }

  const id = crypto.randomUUID();
  const unit = VITAL_UNIT[body.type];

  await c.env.DB.prepare(
    "INSERT INTO vital_readings (id, patient_id, type, value_primary, value_secondary, measured_at, unit, source, created_by, updated_by, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, 0)"
  )
    .bind(id, patientId, body.type, body.value_primary, body.value_secondary ?? null, measuredAt, unit, tokenUser.userId, tokenUser.userId)
    .run();

  safeWaitUntil(c,
    logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "log_vital", kind: "write", statusCode: 201, ip, userAgent })
  );

  return c.json({ id, created_at: new Date().toISOString() }, 201);
});

// ─── POST /patients/:patientId/medications ────────────────────────────────────

externalApiRoutes.post("/patients/:patientId/medications", async (c) => {
  const tokenUser = c.get("tokenUser");
  const patientId = c.req.param("patientId");
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const userAgent = c.req.header("User-Agent") ?? null;

  if (!hasWriteScope(tokenUser)) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "add_medication", kind: "write", statusCode: 403, errorCode: "write_scope_required", ip, userAgent })
    );
    return c.json({ error: "write_scope_required" }, 403);
  }

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    safeWaitUntil(c,logAccess(c.env.DB, {
      tokenId: c.get("tokenUser").tokenId,
      patientId: null,
      tool: "add_medication",
      kind: "write",
      statusCode: 400,
      errorCode: "invalid_body",
      ip: c.req.header("CF-Connecting-IP") ?? null,
      userAgent: c.req.header("User-Agent") ?? null,
    }));
    return c.json({ error: "invalid_body" }, 400);
  }

  const parsed = AddMedicationParamsSchema.safeParse(rawBody);
  if (!parsed.success) {
    safeWaitUntil(c,logAccess(c.env.DB, {
      tokenId: c.get("tokenUser").tokenId,
      patientId: null,
      tool: "add_medication",
      kind: "write",
      statusCode: 400,
      errorCode: "invalid_body",
      ip: c.req.header("CF-Connecting-IP") ?? null,
      userAgent: c.req.header("User-Agent") ?? null,
    }));
    return c.json({ error: "invalid_body", details: parsed.error.flatten() }, 400);
  }

  const body = parsed.data;

  const patientAccess = findPatientAccess(tokenUser, patientId);
  if (!patientAccess) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "add_medication", kind: "write", statusCode: 403, errorCode: "patient_access_denied", ip, userAgent })
    );
    return c.json({ error: "patient_access_denied" }, 403);
  }

  if (patientAccess.role !== "admin") {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "add_medication", kind: "write", statusCode: 403, errorCode: "admin_role_required", ip, userAgent })
    );
    return c.json({ error: "admin_role_required" }, 403);
  }

  const startDate = body.start_date ?? new Date().toISOString().slice(0, 10);
  const canonicalBody = {
    patient_id: patientId,
    brand_name: body.brand_name,
    generic_name: body.generic_name ?? null,
    dosage: body.dosage,
    form: body.form,
    ...(body.start_date !== undefined ? { start_date: body.start_date } : {}),
    reason: body.reason ?? null,
  };
  const payloadHash = await sha256hex(JSON.stringify(canonicalBody));

  if (body.dry_run === true) {
    const confirmationId = await createConfirmation(c.env.DB, tokenUser.tokenId, "add_medication", payloadHash);

    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "add_medication", kind: "dry-run", statusCode: 200, ip, userAgent })
    );

    return c.json({
      dry_run: true,
      preview: { ...canonicalBody, start_date: startDate },
      confirmation_id: confirmationId,
    });
  }

  if (!body.confirmation_id) {
    safeWaitUntil(c,logAccess(c.env.DB, {
      tokenId: tokenUser.tokenId,
      patientId,
      tool: "add_medication",
      kind: "write",
      statusCode: 409,
      errorCode: "confirmation_id_required",
      ip,
      userAgent,
    }));
    return c.json({ error: "confirmation_id_required" }, 409);
  }

  const validation = await validateConfirmation(c.env.DB, body.confirmation_id, "add_medication", payloadHash);
  if (!validation.ok) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "add_medication", kind: "write", statusCode: validation.status, errorCode: validation.error, ip, userAgent })
    );
    return c.json({ error: validation.error }, validation.status);
  }

  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    "INSERT INTO medications (id, patient_id, brand_name, generic_name, dosage, form, start_date, reason, created_by, updated_by, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
  )
    .bind(id, patientId, body.brand_name, body.generic_name ?? null, body.dosage, body.form, startDate, body.reason ?? null, tokenUser.userId, tokenUser.userId)
    .run();

  safeWaitUntil(c,
    logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "add_medication", kind: "write", statusCode: 201, ip, userAgent })
  );

  return c.json({ id, created_at: new Date().toISOString() }, 201);
});

// ─── POST /patients/:patientId/notes ──────────────────────────────────────────

externalApiRoutes.post("/patients/:patientId/notes", async (c) => {
  const tokenUser = c.get("tokenUser");
  const patientId = c.req.param("patientId");
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const userAgent = c.req.header("User-Agent") ?? null;

  if (!hasWriteScope(tokenUser)) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "add_note", kind: "write", statusCode: 403, errorCode: "write_scope_required", ip, userAgent })
    );
    return c.json({ error: "write_scope_required" }, 403);
  }

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    safeWaitUntil(c,logAccess(c.env.DB, {
      tokenId: c.get("tokenUser").tokenId,
      patientId: null,
      tool: "add_note",
      kind: "write",
      statusCode: 400,
      errorCode: "invalid_body",
      ip: c.req.header("CF-Connecting-IP") ?? null,
      userAgent: c.req.header("User-Agent") ?? null,
    }));
    return c.json({ error: "invalid_body" }, 400);
  }

  const parsed = AddNoteParamsSchema.safeParse(rawBody);
  if (!parsed.success) {
    safeWaitUntil(c,logAccess(c.env.DB, {
      tokenId: c.get("tokenUser").tokenId,
      patientId: null,
      tool: "add_note",
      kind: "write",
      statusCode: 400,
      errorCode: "invalid_body",
      ip: c.req.header("CF-Connecting-IP") ?? null,
      userAgent: c.req.header("User-Agent") ?? null,
    }));
    return c.json({ error: "invalid_body", details: parsed.error.flatten() }, 400);
  }

  const body = parsed.data;

  const patientAccess = findPatientAccess(tokenUser, patientId);
  if (!patientAccess) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "add_note", kind: "write", statusCode: 403, errorCode: "patient_access_denied", ip, userAgent })
    );
    return c.json({ error: "patient_access_denied" }, 403);
  }

  if (patientAccess.role !== "admin") {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "add_note", kind: "write", statusCode: 403, errorCode: "admin_role_required", ip, userAgent })
    );
    return c.json({ error: "admin_role_required" }, 403);
  }

  const visitDate = body.visit_date ?? new Date().toISOString().slice(0, 10);
  const canonicalBody = {
    patient_id: patientId,
    ...(body.visit_date !== undefined ? { visit_date: body.visit_date } : {}),
    doctor_name: body.doctor_name ?? null,
    facility: body.facility ?? null,
    diagnosis: body.diagnosis ?? null,
    summary: body.summary ?? "",
    treatment_plan: body.treatment_plan ?? null,
  };
  const payloadHash = await sha256hex(JSON.stringify(canonicalBody));

  if (body.dry_run === true) {
    const confirmationId = await createConfirmation(c.env.DB, tokenUser.tokenId, "add_note", payloadHash);

    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "add_note", kind: "dry-run", statusCode: 200, ip, userAgent })
    );

    return c.json({
      dry_run: true,
      preview: { ...canonicalBody, visit_date: visitDate },
      confirmation_id: confirmationId,
    });
  }

  if (!body.confirmation_id) {
    safeWaitUntil(c,logAccess(c.env.DB, {
      tokenId: tokenUser.tokenId,
      patientId,
      tool: "add_note",
      kind: "write",
      statusCode: 409,
      errorCode: "confirmation_id_required",
      ip,
      userAgent,
    }));
    return c.json({ error: "confirmation_id_required" }, 409);
  }

  const validation = await validateConfirmation(c.env.DB, body.confirmation_id, "add_note", payloadHash);
  if (!validation.ok) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "add_note", kind: "write", statusCode: validation.status, errorCode: validation.error, ip, userAgent })
    );
    return c.json({ error: validation.error }, validation.status);
  }

  const id = crypto.randomUUID();

  await c.env.DB.prepare(
    "INSERT INTO clinical_notes (id, patient_id, visit_date, doctor_name, facility, diagnosis, summary, treatment_plan, created_by, updated_by, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
  )
    .bind(
      id,
      patientId,
      visitDate,
      body.doctor_name ?? null,
      body.facility ?? null,
      body.diagnosis ?? null,
      body.summary ?? "",
      body.treatment_plan ?? null,
      tokenUser.userId,
      tokenUser.userId
    )
    .run();

  safeWaitUntil(c,
    logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "add_note", kind: "write", statusCode: 201, ip, userAgent })
  );

  return c.json({ id, created_at: new Date().toISOString() }, 201);
});

// ─── POST /patients/:patientId/medications/:medicationId/discontinue ──────────

externalApiRoutes.post("/patients/:patientId/medications/:medicationId/discontinue", async (c) => {
  const tokenUser = c.get("tokenUser");
  const patientId = c.req.param("patientId");
  const medicationId = c.req.param("medicationId");
  const ip = c.req.header("CF-Connecting-IP") ?? null;
  const userAgent = c.req.header("User-Agent") ?? null;

  if (!hasWriteScope(tokenUser)) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "discontinue_medication", kind: "write", statusCode: 403, errorCode: "write_scope_required", ip, userAgent })
    );
    return c.json({ error: "write_scope_required" }, 403);
  }

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    safeWaitUntil(c,logAccess(c.env.DB, {
      tokenId: c.get("tokenUser").tokenId,
      patientId: null,
      tool: "discontinue_medication",
      kind: "write",
      statusCode: 400,
      errorCode: "invalid_body",
      ip: c.req.header("CF-Connecting-IP") ?? null,
      userAgent: c.req.header("User-Agent") ?? null,
    }));
    return c.json({ error: "invalid_body" }, 400);
  }

  const parsed = DiscontinueMedicationParamsSchema.safeParse(rawBody);
  if (!parsed.success) {
    safeWaitUntil(c,logAccess(c.env.DB, {
      tokenId: c.get("tokenUser").tokenId,
      patientId: null,
      tool: "discontinue_medication",
      kind: "write",
      statusCode: 400,
      errorCode: "invalid_body",
      ip: c.req.header("CF-Connecting-IP") ?? null,
      userAgent: c.req.header("User-Agent") ?? null,
    }));
    return c.json({ error: "invalid_body", details: parsed.error.flatten() }, 400);
  }

  const body = parsed.data;

  const patientAccess = findPatientAccess(tokenUser, patientId);
  if (!patientAccess) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "discontinue_medication", kind: "write", statusCode: 403, errorCode: "patient_access_denied", ip, userAgent })
    );
    return c.json({ error: "patient_access_denied" }, 403);
  }

  if (patientAccess.role !== "admin") {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "discontinue_medication", kind: "write", statusCode: 403, errorCode: "admin_role_required", ip, userAgent })
    );
    return c.json({ error: "admin_role_required" }, 403);
  }

  const stopDate = new Date().toISOString().slice(0, 10);
  const canonicalBody = {
    medication_id: medicationId,
    stop_date: stopDate,
    reason: body.reason ?? null,
  };
  const payloadHash = await sha256hex(JSON.stringify(canonicalBody));

  if (body.dry_run === true) {
    const confirmationId = await createConfirmation(c.env.DB, tokenUser.tokenId, "discontinue_medication", payloadHash);

    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "discontinue_medication", kind: "dry-run", statusCode: 200, ip, userAgent })
    );

    return c.json({
      dry_run: true,
      preview: { medication_id: medicationId, stop_date: stopDate },
      confirmation_id: confirmationId,
    });
  }

  if (!body.confirmation_id) {
    safeWaitUntil(c,logAccess(c.env.DB, {
      tokenId: tokenUser.tokenId,
      patientId,
      tool: "discontinue_medication",
      kind: "write",
      statusCode: 409,
      errorCode: "confirmation_id_required",
      ip,
      userAgent,
    }));
    return c.json({ error: "confirmation_id_required" }, 409);
  }

  const medRow = await c.env.DB.prepare(
    "SELECT id FROM medications WHERE id = ? AND patient_id = ? AND is_deleted = 0"
  ).bind(medicationId, patientId).first();
  if (!medRow) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "discontinue_medication", kind: "write", statusCode: 404, errorCode: "not_found", ip, userAgent })
    );
    return c.json({ error: "not_found" }, 404);
  }

  const validation = await validateConfirmation(c.env.DB, body.confirmation_id, "discontinue_medication", payloadHash);
  if (!validation.ok) {
    safeWaitUntil(c,
      logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "discontinue_medication", kind: "write", statusCode: validation.status, errorCode: validation.error, ip, userAgent })
    );
    return c.json({ error: validation.error }, validation.status);
  }

  await c.env.DB.prepare(
    "UPDATE medications SET end_date = ?, is_active = 0, updated_by = ? WHERE id = ? AND patient_id = ? AND is_deleted = 0"
  )
    .bind(stopDate, tokenUser.userId, medicationId, patientId)
    .run();

  safeWaitUntil(c,
    logAccess(c.env.DB, { tokenId: tokenUser.tokenId, patientId, tool: "discontinue_medication", kind: "write", statusCode: 200, ip, userAgent })
  );

  return c.json({ id: medicationId, created_at: new Date().toISOString() }, 200);
});
