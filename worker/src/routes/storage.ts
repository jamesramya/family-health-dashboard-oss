import { Hono } from "hono";
import type { Bindings } from "../types";

type Variables = {
  user: { sub: string; role: string; email: string };
};

export const storageRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const QUOTA_BYTES = 1073741824; // 1 GB

// Document types that map to each display category
const DOCUMENT_TYPES = new Set(["blood_report", "consultation", "prescription", "other"]);
const SCAN_TYPES = new Set(["scan", "ecg", "culture_report"]);

// Module-scope per-user cache: key → { ts: number, value: UsageResult }
interface UsageResult {
  total_bytes: number;
  quota_bytes: number;
  by_category: { documents: number; scans: number; photos: number };
}
const usageCache = new Map<string, { ts: number; value: UsageResult }>();
const CACHE_TTL_MS = 60_000;

// GET /api/storage/usage — authenticated
storageRoutes.get("/usage", async (c) => {
  const user = c.get("user");
  const cacheKey = user.sub;

  if (c.env.ENVIRONMENT !== "test") {
    const cached = usageCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return c.json(cached.value);
    }
  }

  const rows = await c.env.DB.prepare(
    `SELECT type, SUM(file_size_bytes) as total
     FROM documents
     WHERE is_deleted = 0
     GROUP BY type`
  ).all<{ type: string; total: number }>();

  let docBytes = 0;
  let scanBytes = 0;

  for (const row of rows.results) {
    if (DOCUMENT_TYPES.has(row.type)) {
      docBytes += row.total;
    } else if (SCAN_TYPES.has(row.type)) {
      scanBytes += row.total;
    }
  }

  const total_bytes = docBytes + scanBytes;

  const result: UsageResult = {
    total_bytes,
    quota_bytes: QUOTA_BYTES,
    by_category: {
      documents: docBytes,
      scans: scanBytes,
      photos: 0,
    },
  };

  if (c.env.ENVIRONMENT !== "test") {
    usageCache.set(cacheKey, { ts: Date.now(), value: result });
  }

  return c.json(result);
});
