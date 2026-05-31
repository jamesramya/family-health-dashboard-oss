// worker/src/workflows/document-extraction.ts
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from "cloudflare:workers";
import type { Bindings } from "../types";
import { extractDocument } from "../services/extractor";
import type { ExtractionResult, CultureReportExtraction, BloodTest } from "../services/extractor";
import { mergeOrCreate } from "../services/test-merger";

interface ExtractionParams {
  documentId: string;
  patientId: string;
  userId: string;
}

// Serialisable document row returned from validate-document step
type DocumentRow = {
  id: string;
  r2_key: string;
  type: string;
  mime_type: string;
  file_size_bytes: number;
  [key: string]: string | number | boolean | null;
};

/**
 * Resolves each test to a test_definition ID via mergeOrCreate (may call LLM for new tests).
 * Returns a map of extraction-array index → testDefId.
 * Isolated here so the Workflow can memoize these LLM calls in their own step.do,
 * preventing downstream D1 failures from replaying them.
 */
export async function resolveTestDefinitions(
  env: Bindings,
  db: D1Database,
  tests: BloodTest[] | undefined,
  userId: string,
): Promise<Record<number, string>> {
  if (!tests || tests.length === 0) return {};
  const result: Record<number, string> = {};
  for (let i = 0; i < tests.length; i++) {
    const merge = await mergeOrCreate(env, db, tests[i], userId);
    result[i] = merge.testDefId;
  }
  return result;
}

export async function persistExtractedTests(
  db: D1Database,
  extraction: ExtractionResult,
  patientId: string,
  documentId: string,
  userId: string,
  resolvedTestDefs: Record<number, string>,
): Promise<void> {
  if (!extraction.tests || extraction.tests.length === 0) return;
  const now = new Date().toISOString();
  const doc = await db.prepare("SELECT document_date FROM documents WHERE id = ?")
    .bind(documentId).first<{ document_date: string }>();
  const documentDate = doc?.document_date ?? now.slice(0, 10);

  for (let i = 0; i < extraction.tests.length; i++) {
    const t = extraction.tests[i];
    const testDefId = resolvedTestDefs[i];
    await db.prepare(
      `INSERT OR IGNORE INTO test_results
         (id, patient_id, test_def_id, document_id, date, value, flag,
          source_lab, report_file, extracted_at,
          ref_low_at_test, ref_high_at_test,
          created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(), patientId, testDefId, documentId,
      t.date ?? extraction.report_date ?? documentDate,
      t.value ?? null, t.flag ?? "NORMAL",
      t.source_lab ?? extraction.lab_name ?? null,
      t.raw_name ?? documentId, now,
      t.ref_low ?? null, t.ref_high ?? null,
      userId, userId,
    ).run();
  }
}

export async function persistCultureResult(
  db: D1Database,
  culture: CultureReportExtraction,
  patientId: string,
  documentId: string,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();

  await db.prepare("DELETE FROM culture_results WHERE document_id = ?").bind(documentId).run();

  await db.prepare(
    `INSERT INTO culture_results
       (id, document_id, patient_id, specimen_type, collection_date, result_status,
        organism, growth_quantity, sensitivities, comments, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    documentId,
    patientId,
    culture.specimen_type,
    culture.collection_date ?? null,
    culture.result_status,
    culture.organism ?? null,
    culture.growth_quantity ?? null,
    JSON.stringify(culture.sensitivities ?? []),
    culture.comments ?? null,
    userId,
    userId,
  ).run();

  if (culture.comments) {
    await db.prepare(
      "DELETE FROM clinical_notes WHERE document_id = ? AND summary = ?"
    ).bind(documentId, culture.comments).run();

    await db.prepare(
      `INSERT INTO clinical_notes
         (id, patient_id, document_id, visit_date, summary, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      patientId,
      documentId,
      culture.collection_date ?? now.slice(0, 10),
      culture.comments,
      userId,
      userId,
    ).run();
  }
}

export class DocumentExtractionWorkflow extends WorkflowEntrypoint<Bindings, ExtractionParams> {
  async run(event: WorkflowEvent<ExtractionParams>, step: WorkflowStep) {
    const { documentId, patientId, userId } = event.payload;

    try {
    // Step 1: Validate document exists, is within size limits, and mark as processing
    const doc = (await step.do("validate-document", async (): Promise<DocumentRow> => {
      const row = await this.env.DB.prepare(
        "SELECT id, r2_key, type, mime_type, file_size_bytes FROM documents WHERE id = ? AND is_deleted = 0"
      ).bind(documentId).first<DocumentRow>();
      if (!row) throw new Error(`Document ${documentId} not found`);
      if (row.file_size_bytes > 20 * 1024 * 1024) throw new Error("File too large (>20MB)");
      await this.env.DB.prepare(
        "UPDATE documents SET processing_status = 'processing', updated_at = datetime('now') WHERE id = ?"
      ).bind(documentId).run();
      // Return only the fields we need — all primitives, satisfies Serializable
      return {
        id: row.id,
        r2_key: row.r2_key,
        type: row.type,
        mime_type: row.mime_type,
        file_size_bytes: row.file_size_bytes,
      };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any as DocumentRow;

    // Step 2: Extract via TypeScript service (calls Gemini through AI Gateway directly)
    const extraction = await step.do("extract-data", {
      retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
    }, async (): Promise<ExtractionResult> => {
      // Read file from R2
      const r2Obj = await this.env.BUCKET.get(doc.r2_key);
      if (!r2Obj) throw new Error(`File not found in R2: ${doc.r2_key}`);
      const fileBytes = new Uint8Array(await r2Obj.arrayBuffer() as ArrayBuffer);

      // Fetch patient demographics for prompt context
      const patient = await this.env.DB.prepare(
        "SELECT name, date_of_birth, gender FROM patient WHERE id = ?"
      ).bind(patientId).first<{ name: string | null; date_of_birth: string | null; gender: string | null }>();

      return extractDocument(
        fileBytes,
        doc.type,
        doc.mime_type,
        patient ?? { name: null, date_of_birth: null, gender: null },
        this.env,
      );
    });

    // Step 3: Validate extracted data — at least one data category present, type/range checks
    await step.do("validate-extraction", async () => {
      if (
        !extraction.tests &&
        !extraction.findings &&
        !extraction.medications &&
        !extraction.notes &&
        !extraction.culture
      ) {
        throw new Error("Extraction returned no structured data");
      }

      if (extraction.tests) {
        for (const t of extraction.tests) {
          const name = t.canonical_name ?? t.raw_name ?? "(unknown)";
          if (t.value !== undefined && typeof t.value !== "number") {
            throw new Error(`Invalid value type for test ${name}: expected number`);
          }
          if (t.flag && !["HIGH", "LOW", "NORMAL"].includes(t.flag)) {
            throw new Error(`Invalid flag "${t.flag}" for test ${name}`);
          }
          if (t.date && !/^\d{4}-\d{2}-\d{2}/.test(t.date)) {
            throw new Error(`Invalid date "${t.date}" for test ${name}`);
          }
        }
      }

      if (extraction.findings) {
        for (const f of extraction.findings) {
          if (!f.findings_summary || !f.scan_type) {
            throw new Error(
              "Scan finding missing required fields: findings_summary and scan_type"
            );
          }
        }
      }

      return null;
    });

    // Step 4: Resolve test definitions — LLM disambiguation happens here.
    // Isolated in its own step so Workflow memoizes results; retries of step 5
    // reuse the cached map without firing any LLM calls.
    const resolvedTestDefs = await step.do(
      "resolve-test-definitions",
      async (): Promise<Record<number, string>> =>
        resolveTestDefinitions(this.env, this.env.DB, extraction.tests, userId),
    );

    // Step 5: Persist extracted data to D1 and mark document complete
    await step.do("persist-data", async () => {
      const now = new Date().toISOString();
      const finalType = extraction._classified_type ?? doc.type;

      await this.env.DB.batch([
        this.env.DB.prepare("DELETE FROM culture_results WHERE document_id = ?").bind(documentId),
        this.env.DB.prepare("DELETE FROM scan_findings WHERE document_id = ?").bind(documentId),
        this.env.DB.prepare("DELETE FROM medications WHERE document_id = ?").bind(documentId),
      ]);

      // --- Blood tests (test_def IDs already resolved by step 4) ---
      await persistExtractedTests(this.env.DB, extraction, patientId, documentId, userId, resolvedTestDefs);

      // --- Scan findings ---
      if (extraction.findings && extraction.findings.length > 0) {
        for (const f of extraction.findings) {
          await this.env.DB.prepare(
            `INSERT INTO scan_findings
               (id, document_id, patient_id, scan_type, body_area, findings_summary,
                impression, ordering_doctor, scan_date, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            crypto.randomUUID(),
            documentId,
            patientId,
            f.scan_type ?? "other",
            f.body_area ?? "unspecified",
            f.findings_summary ?? "",
            f.impression ?? null,
            f.ordering_doctor ?? null,
            f.scan_date ?? now.slice(0, 10),
            userId,
            userId,
          ).run();
        }
      }

      // --- Medications (skip for prescriptions — held for human review) ---
      if (finalType !== "prescription" && extraction.medications && extraction.medications.length > 0) {
        for (const m of extraction.medications) {
          const medId = crypto.randomUUID();
          await this.env.DB.prepare(
            `INSERT INTO medications
               (id, patient_id, document_id, brand_name, generic_name, dosage, form,
                prescribing_doctor, start_date, end_date, reason, notes, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            medId,
            patientId,
            documentId,
            m.brand_name ?? m.name ?? "Unknown",
            m.generic_name ?? null,
            m.dosage ?? "as prescribed",
            m.form ?? "other",
            m.prescribing_doctor ?? null,
            m.start_date ?? now.slice(0, 10),
            m.end_date ?? null,
            m.reason ?? null,
            m.notes ?? null,
            userId,
            userId,
          ).run();

          if (m.schedule && m.schedule.length > 0) {
            for (const s of m.schedule) {
              await this.env.DB.prepare(
                `INSERT INTO medication_schedules
                   (id, medication_id, time_of_day, meal_relation, dose_quantity,
                    specific_time, instructions, created_by, updated_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
              ).bind(
                crypto.randomUUID(),
                medId,
                s.time_of_day ?? "as_needed",
                s.meal_relation ?? "not_applicable",
                s.dose_quantity ?? 1,
                s.specific_time ?? null,
                s.instructions ?? null,
                userId,
                userId,
              ).run();
            }
          }
        }
      }

      // --- Clinical notes ---
      if (extraction.notes && extraction.notes.length > 0) {
        for (const n of extraction.notes) {
          await this.env.DB.prepare(
            `INSERT INTO clinical_notes
               (id, patient_id, document_id, visit_date, doctor_name, facility,
                diagnosis, summary, treatment_plan, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            crypto.randomUUID(),
            patientId,
            documentId,
            n.visit_date ?? now.slice(0, 10),
            n.doctor_name ?? null,
            n.facility ?? null,
            n.diagnosis ?? null,
            n.summary ?? "See attached document",
            n.treatment_plan ?? null,
            userId,
            userId,
          ).run();
        }
      }

      // --- Culture results ---
      if (extraction.culture) {
        await persistCultureResult(
          this.env.DB,
          extraction.culture,
          patientId,
          documentId,
          userId,
        );
      }

      // Mark document complete; set pending_review for prescriptions with medications
      const reviewStatus = (finalType === "prescription" && extraction.medications?.length)
        ? "pending_review"
        : null;
      await this.env.DB.prepare(
        `UPDATE documents
         SET processing_status        = 'complete',
             type                     = ?,
             llm_raw_response         = ?,
             medication_review_status = ?,
             updated_at               = datetime('now'),
             updated_by               = ?
         WHERE id = ?`
      ).bind(finalType, JSON.stringify(extraction), reviewStatus, userId, documentId).run();

      // Update document_date with extracted report_date (fallback: keep upload date)
      if (extraction.report_date) {
        await this.env.DB.prepare(
          "UPDATE documents SET document_date = ? WHERE id = ?"
        ).bind(extraction.report_date, documentId).run();
      }

      return null;
    });

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.env.DB.prepare(
        `UPDATE documents
         SET processing_status = 'failed',
             llm_raw_response  = ?,
             updated_at        = datetime('now')
         WHERE id = ?`
      ).bind(JSON.stringify({ error: message }), documentId).run();
      throw err; // re-throw so Workflow records the failure
    }
  }
}
