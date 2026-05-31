import { z } from 'zod';

// These schemas cover JSON request bodies (MCP JSON-RPC + REST POST bodies).
// Query-string parameters must be coerced before parsing (query strings deliver numbers/booleans as strings).

// ─── Shared enums ────────────────────────────────────────────────────────────

export const VitalTypeSchema = z.enum(['bp', 'glucose', 'weight', 'heart_rate', 'spo2', 'temperature']);
export type VitalType = z.infer<typeof VitalTypeSchema>;

export const MedicationFormSchema = z.enum(['tablet', 'capsule', 'syrup', 'injection', 'cream', 'drops', 'inhaler', 'other']);
export type MedicationForm = z.infer<typeof MedicationFormSchema>;

// ─── Read tool parameter schemas ─────────────────────────────────────────────

export const ListPatientsParamsSchema = z.object({});
export type ListPatientsParams = z.infer<typeof ListPatientsParamsSchema>;

export const GetPatientSummaryParamsSchema = z.object({
  patient_id: z.string(),
});
export type GetPatientSummaryParams = z.infer<typeof GetPatientSummaryParamsSchema>;

export const GetVitalsParamsSchema = z.object({
  patient_id: z.string(),
  type: VitalTypeSchema.optional(),
  limit: z.number().int().positive().max(500).optional(),
});
export type GetVitalsParams = z.infer<typeof GetVitalsParamsSchema>;

export const GetMedicationsParamsSchema = z.object({
  patient_id: z.string(),
});
export type GetMedicationsParams = z.infer<typeof GetMedicationsParamsSchema>;

export const GetBloodWorkParamsSchema = z.object({
  patient_id: z.string(),
  limit: z.number().int().positive().max(500).optional(),
});
export type GetBloodWorkParams = z.infer<typeof GetBloodWorkParamsSchema>;

export const GetNotesParamsSchema = z.object({
  patient_id: z.string(),
});
export type GetNotesParams = z.infer<typeof GetNotesParamsSchema>;

export const GetScansParamsSchema = z.object({
  patient_id: z.string(),
});
export type GetScansParams = z.infer<typeof GetScansParamsSchema>;

export const GetCulturesParamsSchema = z.object({
  patient_id: z.string(),
});
export type GetCulturesParams = z.infer<typeof GetCulturesParamsSchema>;

// ─── Write tool parameter schemas ────────────────────────────────────────────

export const LogVitalParamsSchema = z.object({
  type: VitalTypeSchema,
  value_primary: z.number(),
  value_secondary: z.number().optional(),
  measured_at: z.union([
    z.string().datetime({ offset: true }),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ]).optional(),
  dry_run: z.boolean().optional(),
  confirmation_id: z.string().optional(),
});
export type LogVitalParams = z.infer<typeof LogVitalParamsSchema>;

export const AddMedicationParamsSchema = z.object({
  brand_name: z.string(),
  generic_name: z.string().optional(),
  dosage: z.string(),
  form: MedicationFormSchema,
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reason: z.string().optional(),
  dry_run: z.boolean().optional(),
  confirmation_id: z.string().optional(),
});
export type AddMedicationParams = z.infer<typeof AddMedicationParamsSchema>;

export const AddNoteParamsSchema = z.object({
  visit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  doctor_name: z.string().optional(),
  facility: z.string().optional(),
  diagnosis: z.string().optional(),
  summary: z.string().optional(),
  treatment_plan: z.string().optional(),
  dry_run: z.boolean().optional(),
  confirmation_id: z.string().optional(),
});
export type AddNoteParams = z.infer<typeof AddNoteParamsSchema>;

export const DiscontinueMedicationParamsSchema = z.object({
  medication_id: z.string(),
  reason: z.string().optional(),
  dry_run: z.boolean().optional(),
  confirmation_id: z.string().optional(),
});
export type DiscontinueMedicationParams = z.infer<typeof DiscontinueMedicationParamsSchema>;

// ─── Response shapes ─────────────────────────────────────────────────────────

export const AccessLogEntrySchema = z.object({
  id: z.string(),
  oauth_client_id: z.string(),
  oauth_client_name: z.string(),
  patient_id: z.string().nullable(),
  patient_name: z.string().nullable(),
  tool: z.string(),
  kind: z.string(),
  status_code: z.number(),
  error_code: z.string().nullable(),
  ip: z.string().nullable(),
  created_at: z.string(),
});
export type AccessLogEntry = z.infer<typeof AccessLogEntrySchema>;

export const DryRunResponseSchema = z.object({
  dry_run: z.literal(true),
  preview: z.unknown(),
  confirmation_id: z.string(),
});
export type DryRunResponse = z.infer<typeof DryRunResponseSchema>;

export const WriteResponseSchema = z.object({
  id: z.string(),
  created_at: z.string(),
});
export type WriteResponse = z.infer<typeof WriteResponseSchema>;
