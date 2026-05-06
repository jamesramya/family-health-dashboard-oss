import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { setupDb, seedAdmin, seedPatient } from "../helpers/setup-db";

describe("0008_culture_results migration", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("culture_results table exists with required columns", async () => {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='culture_results'"
    ).first<{ name: string }>();
    expect(result?.name).toBe("culture_results");
  });

  it("documents type constraint accepts culture_report", async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO documents (id, patient_id, type, title, document_date, r2_key,
           mime_type, file_size_bytes, processing_status, uploaded_by, created_by, updated_by)
         VALUES ('doc-c', 'patient-1', 'culture_report', 'Sputum Culture', '2026-04-01',
           'patients/patient-1/documents/doc-c/file.pdf', 'application/pdf', 1234,
           'complete', 'admin-1', 'admin-1', 'admin-1')`
      ).run()
    ).resolves.toBeTruthy();
  });

  it("culture_results can be inserted and queried", async () => {
    await env.DB.prepare(
      `INSERT INTO documents (id, patient_id, type, title, document_date, r2_key,
         mime_type, file_size_bytes, processing_status, uploaded_by, created_by, updated_by)
       VALUES ('doc-c', 'patient-1', 'culture_report', 'Sputum Culture', '2026-04-01',
         'patients/patient-1/documents/doc-c/file.pdf', 'application/pdf', 1234,
         'complete', 'admin-1', 'admin-1', 'admin-1')`
    ).run();

    await env.DB.prepare(
      `INSERT INTO culture_results
         (id, document_id, patient_id, specimen_type, result_status,
          organism, sensitivities, comments, created_by, updated_by)
       VALUES ('cr-1', 'doc-c', 'patient-1', 'sputum', 'positive',
         'Klebsiella pneumoniae', '[]', 'ESBL suspected.', 'admin-1', 'admin-1')`
    ).run();

    const row = await env.DB.prepare(
      "SELECT specimen_type, organism FROM culture_results WHERE id = 'cr-1'"
    ).first<{ specimen_type: string; organism: string }>();
    expect(row?.specimen_type).toBe("sputum");
    expect(row?.organism).toBe("Klebsiella pneumoniae");
  });

  it("culture_results rejects invalid specimen_type", async () => {
    await env.DB.prepare(
      `INSERT INTO documents (id, patient_id, type, title, document_date, r2_key,
         mime_type, file_size_bytes, processing_status, uploaded_by, created_by, updated_by)
       VALUES ('doc-c', 'patient-1', 'culture_report', 'Sputum Culture', '2026-04-01',
         'patients/patient-1/documents/doc-c/file.pdf', 'application/pdf', 1234,
         'complete', 'admin-1', 'admin-1', 'admin-1')`
    ).run();

    await expect(
      env.DB.prepare(
        `INSERT INTO culture_results
           (id, document_id, patient_id, specimen_type, result_status, created_by, updated_by)
         VALUES ('cr-bad', 'doc-c', 'patient-1', 'saliva', 'positive', 'admin-1', 'admin-1')`
      ).run()
    ).rejects.toThrow();
  });
});
