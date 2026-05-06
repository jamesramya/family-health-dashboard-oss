import type { Bindings } from "./types";
import { runBackup } from "./services/backup";

interface PurgeSummary {
  table: string;
  rowsDeleted: number;
  r2KeysToDelete?: string[];
}

export async function handleScheduled(
  _event: ScheduledEvent,
  env: Bindings,
  _ctx: ExecutionContext
): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const summaries: PurgeSummary[] = [];
  let totalRows = 0;
  let r2ObjectsDeleted = 0;

  // Purge documents — need to collect r2_keys before deleting
  const docsToDelete = await env.DB.prepare(
    "SELECT id, r2_key FROM documents WHERE is_deleted = 1 AND deleted_at < ?"
  ).bind(cutoff).all<{ id: string; r2_key: string }>();

  if (docsToDelete.results.length > 0) {
    const docIds = docsToDelete.results.map((d) => d.id);
    const r2Keys = docsToDelete.results.map((d) => d.r2_key);

    // Hard-delete documents
    for (const id of docIds) {
      await env.DB.prepare("DELETE FROM documents WHERE id = ?").bind(id).run();
    }

    // Delete corresponding R2 objects
    for (const key of r2Keys) {
      try {
        await env.BUCKET.delete(key);
        r2ObjectsDeleted++;
      } catch {
        console.log(`[purge] Failed to delete R2 object: ${key}`);
      }
    }

    summaries.push({ table: "documents", rowsDeleted: docIds.length, r2KeysToDelete: r2Keys });
    totalRows += docIds.length;
  }

  // Tables to purge (no R2 objects)
  const tablesToPurge = [
    "vital_readings",
    "scan_findings",
    "medication_schedules",
    "medications",
    "clinical_notes",
    "test_results",
  ];

  for (const table of tablesToPurge) {
    const result = await env.DB.prepare(
      `DELETE FROM ${table} WHERE is_deleted = 1 AND deleted_at < ?`
    ).bind(cutoff).run();

    const rowsDeleted = result.meta?.changes ?? 0;
    if (rowsDeleted > 0) {
      summaries.push({ table, rowsDeleted });
      totalRows += rowsDeleted;
    }
  }

  // Purge soft-deleted patients
  const patientsResult = await env.DB.prepare(
    "DELETE FROM patient WHERE is_deleted = 1 AND deleted_at < ?"
  ).bind(cutoff).run();
  const patientRows = patientsResult.meta?.changes ?? 0;
  if (patientRows > 0) {
    summaries.push({ table: "patient", rowsDeleted: patientRows });
    totalRows += patientRows;
  }

  // Log purge summary
  const tablesAffected = summaries.map((s) => s.table).join(",");
  console.log(`[purge] Completed: ${totalRows} rows purged across tables: ${tablesAffected || "none"}, R2 objects deleted: ${r2ObjectsDeleted}`);

  // Insert purge_log record (always, even if nothing purged)
  await env.DB.prepare(
    `INSERT INTO purge_log (id, tables_affected, total_rows, r2_objects_deleted)
     VALUES (?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    tablesAffected || "none",
    totalRows,
    r2ObjectsDeleted
  ).run();

  // Run backup after purge (so we back up the cleaned state)
  const backupResult = await runBackup(env);
  console.log(`[backup] r2=${backupResult.r2} github=${backupResult.github}`);
}
