import { Hono } from "hono";
import type { Bindings } from "../types";

export const openApiRoute = new Hono<{ Bindings: Bindings }>();

const WRITE_DESCRIPTION =
  "Call with dry_run=true first to preview the change and receive a confirmation_id. Then repeat the call with that confirmation_id to commit.";

const PATIENT_ID_PARAM = {
  name: "patientId",
  in: "path",
  required: true,
  schema: { type: "string" },
  description: "Patient UUID",
};

const DRY_RUN_PROP = {
  type: "boolean",
  description: "If true, returns a preview and confirmation_id without writing",
};

const CONFIRMATION_ID_PROP = {
  type: "string",
  description: "UUID from a prior dry_run call. Required to commit the write.",
};

const WRITE_RESPONSES = {
  "400": { description: "Invalid request body" },
  "401": { description: "Missing or invalid Bearer token" },
  "403": { description: "Insufficient scope or patient access denied" },
  "409": { description: "confirmation_id required or confirmation mismatch" },
};

const READ_RESPONSES = {
  "401": { description: "Missing or invalid Bearer token" },
  "403": { description: "Patient access denied" },
  "404": { description: "Patient not found" },
};

const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Family Health Dashboard API",
    version: "1.0.0",
    description:
      "External API for LLM chat integration. All endpoints require Bearer token authentication. For write operations: call with dry_run=true first to get a confirmation_id, then repeat the call with that confirmation_id to commit the change.",
  },
  servers: [{ url: "/api/external" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "opaque",
        description:
          "OAuth 2.1 Bearer token issued via the PKCE authorization flow at /oauth/authorize. Obtain by connecting your MCP client to {origin}/mcp — the client handles the OAuth flow automatically.",
      },
    },
  },
  paths: {
    "/patients": {
      get: {
        operationId: "list_patients",
        summary: "List all patients accessible to this token",
        responses: {
          "200": { description: "List of accessible patients" },
          "401": { description: "Missing or invalid Bearer token" },
        },
      },
    },
    "/patients/{patientId}/summary": {
      get: {
        operationId: "get_patient_summary",
        summary: "Get patient summary including latest vitals and active medication count",
        parameters: [PATIENT_ID_PARAM],
        responses: {
          "200": { description: "Patient summary with latest vitals and active medication count" },
          ...READ_RESPONSES,
        },
      },
    },
    "/patients/{patientId}/vitals": {
      get: {
        operationId: "get_vitals",
        summary: "Get vital readings for a patient",
        parameters: [
          PATIENT_ID_PARAM,
          {
            name: "type",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["bp", "glucose", "weight", "heart_rate", "spo2", "temperature"],
            },
            description: "Filter by vital type",
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", maximum: 500 },
            description: "Maximum number of results (default 100, max 500)",
          },
        ],
        responses: {
          "200": { description: "List of vital readings" },
          ...READ_RESPONSES,
        },
      },
      post: {
        operationId: "log_vital",
        summary: "Log a new vital reading for a patient",
        description: WRITE_DESCRIPTION,
        parameters: [PATIENT_ID_PARAM],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["type", "value_primary"],
                properties: {
                  type: {
                    type: "string",
                    enum: ["bp", "glucose", "weight", "heart_rate", "spo2", "temperature"],
                  },
                  value_primary: { type: "number" },
                  value_secondary: { type: "number" },
                  measured_at: {
                    type: "string",
                    format: "date-time",
                    description: "ISO 8601 datetime with offset; defaults to now",
                  },
                  dry_run: DRY_RUN_PROP,
                  confirmation_id: CONFIRMATION_ID_PROP,
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Dry-run preview with confirmation_id" },
          "201": { description: "Vital reading created" },
          ...WRITE_RESPONSES,
        },
      },
    },
    "/patients/{patientId}/medications": {
      get: {
        operationId: "get_medications",
        summary: "Get medications for a patient",
        parameters: [PATIENT_ID_PARAM],
        responses: {
          "200": { description: "List of medications" },
          ...READ_RESPONSES,
        },
      },
      post: {
        operationId: "add_medication",
        summary: "Add a new medication for a patient",
        description: WRITE_DESCRIPTION,
        parameters: [PATIENT_ID_PARAM],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["brand_name", "dosage", "form", "start_date"],
                properties: {
                  brand_name: { type: "string" },
                  generic_name: { type: "string" },
                  dosage: { type: "string" },
                  form: {
                    type: "string",
                    enum: [
                      "tablet",
                      "capsule",
                      "syrup",
                      "injection",
                      "cream",
                      "drops",
                      "inhaler",
                      "other",
                    ],
                  },
                  start_date: {
                    type: "string",
                    pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                    description: "Date in YYYY-MM-DD format",
                  },
                  reason: { type: "string" },
                  dry_run: DRY_RUN_PROP,
                  confirmation_id: CONFIRMATION_ID_PROP,
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Dry-run preview with confirmation_id" },
          "201": { description: "Medication added" },
          ...WRITE_RESPONSES,
        },
      },
    },
    "/patients/{patientId}/blood-work": {
      get: {
        operationId: "get_blood_work",
        summary: "Get blood work results for a patient",
        parameters: [
          PATIENT_ID_PARAM,
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", maximum: 500 },
            description: "Maximum number of results (default 50, max 500)",
          },
        ],
        responses: {
          "200": { description: "List of blood work results" },
          ...READ_RESPONSES,
        },
      },
    },
    "/patients/{patientId}/notes": {
      get: {
        operationId: "get_notes",
        summary: "Get clinical notes for a patient",
        parameters: [PATIENT_ID_PARAM],
        responses: {
          "200": { description: "List of clinical notes" },
          ...READ_RESPONSES,
        },
      },
      post: {
        operationId: "add_note",
        summary: "Add a clinical note for a patient",
        description: WRITE_DESCRIPTION,
        parameters: [PATIENT_ID_PARAM],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["visit_date"],
                properties: {
                  visit_date: {
                    type: "string",
                    pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                    description: "Visit date in YYYY-MM-DD format",
                  },
                  doctor_name: { type: "string" },
                  facility: { type: "string" },
                  diagnosis: { type: "string" },
                  summary: { type: "string" },
                  treatment_plan: { type: "string" },
                  dry_run: DRY_RUN_PROP,
                  confirmation_id: CONFIRMATION_ID_PROP,
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Dry-run preview with confirmation_id" },
          "201": { description: "Note added" },
          ...WRITE_RESPONSES,
        },
      },
    },
    "/patients/{patientId}/scans": {
      get: {
        operationId: "get_scans",
        summary: "Get scan findings for a patient",
        parameters: [PATIENT_ID_PARAM],
        responses: {
          "200": { description: "List of scan findings" },
          ...READ_RESPONSES,
        },
      },
    },
    "/patients/{patientId}/cultures": {
      get: {
        operationId: "get_cultures",
        summary: "Get culture results for a patient",
        parameters: [PATIENT_ID_PARAM],
        responses: {
          "200": { description: "List of culture results" },
          ...READ_RESPONSES,
        },
      },
    },
    "/patients/{patientId}/medications/{medicationId}/discontinue": {
      post: {
        operationId: "discontinue_medication",
        summary: "Discontinue an active medication for a patient",
        description: WRITE_DESCRIPTION,
        parameters: [
          PATIENT_ID_PARAM,
          {
            name: "medicationId",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Medication UUID",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: [],
                properties: {
                  reason: { type: "string", description: "Reason for discontinuing" },
                  dry_run: DRY_RUN_PROP,
                  confirmation_id: CONFIRMATION_ID_PROP,
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Medication discontinued (or dry-run preview with confirmation_id)" },
          ...WRITE_RESPONSES,
          "404": { description: "Medication not found" },
        },
      },
    },
  },
};

openApiRoute.get("/openapi.json", (c) => {
  return c.json(OPENAPI_SPEC);
});
