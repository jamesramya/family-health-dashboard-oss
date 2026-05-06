import { Hono } from "hono";
import type { Bindings } from "../types";
import { canonicalKey } from "../services/canonical-key";

type Variables = {
  user: { sub: string; role: string; email: string };
};

export const adminTestReviewRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

async function checkSuperAdmin(c: any): Promise<boolean> {
  const user = c.get("user") as { sub: string; role: string; email: string } | undefined;
  if (!user) return false;
  const row = await c.env.DB.prepare(
    "SELECT is_super_admin FROM users WHERE id = ?",
  ).bind(user.sub).first() as { is_super_admin: number } | null;
  return row?.is_super_admin === 1;
}

// GET /test-review — list needs_review definitions with merge candidates
adminTestReviewRoutes.get("/", async (c) => {
  if (!(await checkSuperAdmin(c))) {
    return c.json({ error: "Forbidden: super admin required" }, 403);
  }

  const { results: items } = await c.env.DB.prepare(
    `SELECT id, canonical_key, canonical_name, label, unit, category, ref_low, ref_high, aliases, created_at
     FROM test_definitions WHERE needs_review = 1 AND is_deleted = 0
     ORDER BY created_at DESC`,
  ).all<{
    id: string; canonical_key: string; canonical_name: string;
    label: string; unit: string; category: string;
    ref_low: number | null; ref_high: number | null;
    aliases: string; created_at: string;
  }>();

  const enriched = await Promise.all(items.map(async (item) => {
    const { results: candidates } = await c.env.DB.prepare(
      `SELECT id, canonical_key, canonical_name, label, unit
       FROM test_definitions
       WHERE category = ? AND is_deleted = 0 AND needs_review = 0 AND id != ?
       ORDER BY canonical_name
       LIMIT 20`,
    ).bind(item.category, item.id).all<{
      id: string; canonical_key: string; canonical_name: string;
      label: string; unit: string;
    }>();

    return { ...item, candidates };
  }));

  return c.json({ items: enriched });
});

// POST /test-review/:id/merge — merge into target definition
adminTestReviewRoutes.post("/:id/merge", async (c) => {
  if (!(await checkSuperAdmin(c))) {
    return c.json({ error: "Forbidden: super admin required" }, 403);
  }

  const id = c.req.param("id");
  const body = await c.req.json<{ targetTestDefId: string }>();
  if (!body.targetTestDefId) {
    return c.json({ error: "targetTestDefId is required" }, 400);
  }

  const source = await c.env.DB.prepare(
    "SELECT id, canonical_name, aliases FROM test_definitions WHERE id = ? AND is_deleted = 0",
  ).bind(id).first<{ id: string; canonical_name: string; aliases: string }>();
  if (!source) return c.json({ error: "Source not found" }, 404);

  const target = await c.env.DB.prepare(
    "SELECT id, aliases FROM test_definitions WHERE id = ? AND is_deleted = 0",
  ).bind(body.targetTestDefId).first<{ id: string; aliases: string }>();
  if (!target) return c.json({ error: "Target not found" }, 404);

  const user = c.get("user");

  // Reassign readings (skip duplicates via OR IGNORE)
  await c.env.DB.prepare(
    `UPDATE OR IGNORE test_results SET test_def_id = ? WHERE test_def_id = ?`,
  ).bind(target.id, source.id).run();
  // Delete any remaining that couldn't be reassigned (true duplicates)
  await c.env.DB.prepare(
    "DELETE FROM test_results WHERE test_def_id = ?",
  ).bind(source.id).run();

  // Merge aliases
  const sourceAliases: string[] = JSON.parse(source.aliases ?? "[]");
  const targetAliases: string[] = JSON.parse(target.aliases ?? "[]");
  const merged = new Set([...targetAliases, ...sourceAliases, source.canonical_name.toLowerCase()]);
  await c.env.DB.prepare(
    "UPDATE test_definitions SET aliases = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?",
  ).bind(JSON.stringify([...merged]), user.sub, target.id).run();

  // Soft-delete source (rename canonical_name to avoid UNIQUE collision)
  await c.env.DB.prepare(
    `UPDATE test_definitions SET
      canonical_name = canonical_name || '__merged_' || SUBSTR(id, 1, 8),
      is_deleted = 1, deleted_at = datetime('now'), deleted_by = ?, needs_review = 0
     WHERE id = ?`,
  ).bind(user.sub, source.id).run();

  return c.json({ ok: true, mergedInto: target.id });
});

// POST /test-review/:id/confirm — keep as new definition, clear needs_review
adminTestReviewRoutes.post("/:id/confirm", async (c) => {
  if (!(await checkSuperAdmin(c))) {
    return c.json({ error: "Forbidden: super admin required" }, 403);
  }

  const id = c.req.param("id");
  const body = await c.req.json<{ canonicalName?: string }>().catch(() => ({}) as { canonicalName?: string });

  const row = await c.env.DB.prepare(
    "SELECT id, canonical_name FROM test_definitions WHERE id = ? AND is_deleted = 0",
  ).bind(id).first() as { id: string; canonical_name: string } | null;
  if (!row) return c.json({ error: "Not found" }, 404);

  const user = c.get("user");
  const newName = body.canonicalName ?? row.canonical_name;
  const newKey = canonicalKey(newName);

  await c.env.DB.prepare(
    `UPDATE test_definitions SET
      canonical_name = ?, canonical_key = ?, label = ?,
      needs_review = 0, updated_by = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).bind(newName, newKey, newName, user.sub, id).run();

  return c.json({ ok: true, canonical_key: newKey });
});

// POST /test-review/:id/delete — delete definition + readings
adminTestReviewRoutes.post("/:id/delete", async (c) => {
  if (!(await checkSuperAdmin(c))) {
    return c.json({ error: "Forbidden: super admin required" }, 403);
  }

  const id = c.req.param("id");
  const body = await c.req.json<{ confirm: string }>();
  if (body.confirm !== "DELETE") {
    return c.json({ error: "Must pass { confirm: \"DELETE\" }" }, 400);
  }

  const row = await c.env.DB.prepare(
    "SELECT id FROM test_definitions WHERE id = ? AND is_deleted = 0",
  ).bind(id).first();
  if (!row) return c.json({ error: "Not found" }, 404);

  const user = c.get("user");

  // Soft-delete readings
  await c.env.DB.prepare(
    "UPDATE test_results SET is_deleted = 1, deleted_at = datetime('now'), deleted_by = ? WHERE test_def_id = ?",
  ).bind(user.sub, id).run();

  // Soft-delete definition (rename canonical_name to avoid UNIQUE collision)
  await c.env.DB.prepare(
    `UPDATE test_definitions SET
      canonical_name = canonical_name || '__deleted_' || SUBSTR(id, 1, 8),
      is_deleted = 1, deleted_at = datetime('now'), deleted_by = ?, needs_review = 0
     WHERE id = ?`,
  ).bind(user.sub, id).run();

  return c.json({ ok: true });
});
