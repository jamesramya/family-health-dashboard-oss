import { Hono } from "hono";
import { tokenAuthMiddleware, type TokenAuthVariables } from "../middleware/token-auth";
import { externalApiRoutes } from "./external-api";
import { getSafeExecCtx } from "../services/wait-until";
import type { Bindings } from "../types";

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

function jsonRpcResult(id: string | number | null, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function mcpToolResult(id: string | number | null, data: unknown) {
  return jsonRpcResult(id, { content: [{ type: "text", text: JSON.stringify(data) }], isError: false });
}

function mcpToolError(id: string | number | null, message: string) {
  return jsonRpcResult(id, { content: [{ type: "text", text: message }], isError: true });
}

// ─── Tool definitions ─────────────────────────────────────────────────────────
// Static tool list — manually derived from Zod schemas in ../schemas/external.ts.
// No json-schema library is used.

const TOOLS = [
  // Read tools
  {
    name: "list_patients",
    description: "List all patients the token has access to",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_patient_summary",
    description: "Get summary for a patient including latest vitals and medication count",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string" },
      },
      required: ["patient_id"],
    },
  },
  {
    name: "get_vitals",
    description: "Get vital readings for a patient. Types: bp, glucose, weight, heart_rate, spo2, temperature",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string" },
        type: {
          type: "string",
          enum: ["bp", "glucose", "weight", "heart_rate", "spo2", "temperature"],
        },
        limit: { type: "integer", minimum: 1, maximum: 500 },
      },
      required: ["patient_id"],
    },
  },
  {
    name: "get_medications",
    description: "Get medications for a patient",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string" },
      },
      required: ["patient_id"],
    },
  },
  {
    name: "get_blood_work",
    description: "Get blood work / lab results for a patient",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 500 },
      },
      required: ["patient_id"],
    },
  },
  {
    name: "get_notes",
    description: "Get clinical notes for a patient",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string" },
      },
      required: ["patient_id"],
    },
  },
  {
    name: "get_scans",
    description: "Get scan findings for a patient",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string" },
      },
      required: ["patient_id"],
    },
  },
  {
    name: "get_cultures",
    description: "Get culture results for a patient",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string" },
      },
      required: ["patient_id"],
    },
  },
  // Write tools
  {
    name: "log_vital",
    description:
      "Log a vital reading. IMPORTANT: Call with dry_run=true first to preview, then pass confirmation_id to commit. For measured_at: omit to use the current moment; pass YYYY-MM-DD if only the date is known (server will use current UTC time on that date); pass full ISO 8601 datetime if the exact time is known. Never construct a midnight timestamp like T00:00:00Z when only the date is known.",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string" },
        type: {
          type: "string",
          enum: ["bp", "glucose", "weight", "heart_rate", "spo2", "temperature"],
        },
        value_primary: { type: "number" },
        value_secondary: { type: "number" },
        measured_at: {
          type: "string",
          description: "ISO 8601 datetime (e.g. 2026-05-26T14:30:00Z) or date-only (e.g. 2026-05-26). Omit to use current time.",
        },
        dry_run: { type: "boolean" },
        confirmation_id: { type: "string" },
      },
      required: ["patient_id", "type", "value_primary"],
    },
  },
  {
    name: "add_medication",
    description:
      "Add a medication. IMPORTANT: Call with dry_run=true first to preview, then pass confirmation_id to commit. start_date defaults to today if omitted.",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string" },
        brand_name: { type: "string" },
        generic_name: { type: "string" },
        dosage: { type: "string" },
        form: {
          type: "string",
          enum: ["tablet", "capsule", "syrup", "injection", "cream", "drops", "inhaler", "other"],
        },
        start_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "YYYY-MM-DD. Defaults to today if omitted." },
        reason: { type: "string" },
        dry_run: { type: "boolean" },
        confirmation_id: { type: "string" },
      },
      required: ["patient_id", "brand_name", "dosage", "form"],
    },
  },
  {
    name: "add_note",
    description:
      "Add a clinical note. IMPORTANT: Call with dry_run=true first to preview, then pass confirmation_id to commit. visit_date defaults to today if omitted.",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string" },
        visit_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "YYYY-MM-DD. Defaults to today if omitted." },
        doctor_name: { type: "string" },
        facility: { type: "string" },
        diagnosis: { type: "string" },
        summary: { type: "string" },
        treatment_plan: { type: "string" },
        dry_run: { type: "boolean" },
        confirmation_id: { type: "string" },
      },
      required: ["patient_id"],
    },
  },
  {
    name: "discontinue_medication",
    description:
      "Discontinue a medication. IMPORTANT: Call with dry_run=true first to preview, then pass confirmation_id to commit.",
    inputSchema: {
      type: "object",
      properties: {
        patient_id: { type: "string" },
        medication_id: { type: "string" },
        reason: { type: "string" },
        dry_run: { type: "boolean" },
        confirmation_id: { type: "string" },
      },
      required: ["patient_id", "medication_id"],
    },
  },
];

// ─── MCP app (POST /) — mounted at /mcp in index.ts ──────────────────────────

export const mcpApp = new Hono<{ Bindings: Bindings; Variables: TokenAuthVariables }>();

mcpApp.use("/", tokenAuthMiddleware);

mcpApp.post("/", async (c) => {
  let params: { jsonrpc: string; method: string; params?: unknown; id: string | number | null };
  try {
    params = await c.req.json();
  } catch {
    return c.json(jsonRpcError(null, -32700, "Parse error"), 400);
  }

  const id = params.id ?? null;

  switch (params.method) {
    case "initialize": {
      return c.json(
        jsonRpcResult(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "Family Health Dashboard", version: "1.0.0" },
        })
      );
    }

    case "tools/list": {
      return c.json(jsonRpcResult(id, { tools: TOOLS }));
    }

    case "tools/call": {
      const callParams = params.params as { name: string; arguments?: Record<string, unknown> } | undefined;
      if (!callParams?.name) {
        return c.json(jsonRpcError(id, -32602, "Invalid params: missing name"));
      }

      const toolName = callParams.name;
      // `arguments` is a reserved identifier in non-strict contexts — alias it on destructure
      const { arguments: args = {} } = callParams;
      const auth = c.req.header("Authorization") ?? "";

      // Dispatch to the matching external-api route.
      // Note: externalApiRoutes runs tokenAuthMiddleware internally, so auth is validated twice
      // per MCP call (once here, once in the internal fetch). This is intentional — the
      // internal fetch approach is zero-network but can't bypass the existing middleware guard.
      switch (toolName) {
        case "list_patients": {
          const internalReq = new Request("http://internal/patients", {
            headers: { Authorization: auth },
          });
          const res = await externalApiRoutes.fetch(internalReq, c.env, getSafeExecCtx(c));
          const data = await res.json();
          if (!res.ok) return c.json(mcpToolError(id, (data as { error?: string }).error ?? "tool_error"));
          return c.json(mcpToolResult(id, data));
        }

        case "get_patient_summary": {
          const { patient_id } = args as { patient_id: string };
          const internalReq = new Request(`http://internal/patients/${patient_id}/summary`, {
            headers: { Authorization: auth },
          });
          const res = await externalApiRoutes.fetch(internalReq, c.env, getSafeExecCtx(c));
          const data = await res.json();
          if (!res.ok) return c.json(mcpToolError(id, (data as { error?: string }).error ?? "tool_error"));
          return c.json(mcpToolResult(id, data));
        }

        case "get_vitals": {
          const { patient_id, type, limit } = args as { patient_id: string; type?: string; limit?: number };
          const url = new URL(`http://internal/patients/${patient_id}/vitals`);
          if (type) url.searchParams.set("type", type);
          if (limit !== undefined) url.searchParams.set("limit", String(limit));
          const internalReq = new Request(url.toString(), {
            headers: { Authorization: auth },
          });
          const res = await externalApiRoutes.fetch(internalReq, c.env, getSafeExecCtx(c));
          const data = await res.json();
          if (!res.ok) return c.json(mcpToolError(id, (data as { error?: string }).error ?? "tool_error"));
          return c.json(mcpToolResult(id, data));
        }

        case "get_medications": {
          const { patient_id } = args as { patient_id: string };
          const internalReq = new Request(`http://internal/patients/${patient_id}/medications`, {
            headers: { Authorization: auth },
          });
          const res = await externalApiRoutes.fetch(internalReq, c.env, getSafeExecCtx(c));
          const data = await res.json();
          if (!res.ok) return c.json(mcpToolError(id, (data as { error?: string }).error ?? "tool_error"));
          return c.json(mcpToolResult(id, data));
        }

        case "get_blood_work": {
          const { patient_id, limit } = args as { patient_id: string; limit?: number };
          const url = new URL(`http://internal/patients/${patient_id}/blood-work`);
          if (limit !== undefined) url.searchParams.set("limit", String(limit));
          const internalReq = new Request(url.toString(), {
            headers: { Authorization: auth },
          });
          const res = await externalApiRoutes.fetch(internalReq, c.env, getSafeExecCtx(c));
          const data = await res.json();
          if (!res.ok) return c.json(mcpToolError(id, (data as { error?: string }).error ?? "tool_error"));
          return c.json(mcpToolResult(id, data));
        }

        case "get_notes": {
          const { patient_id } = args as { patient_id: string };
          const internalReq = new Request(`http://internal/patients/${patient_id}/notes`, {
            headers: { Authorization: auth },
          });
          const res = await externalApiRoutes.fetch(internalReq, c.env, getSafeExecCtx(c));
          const data = await res.json();
          if (!res.ok) return c.json(mcpToolError(id, (data as { error?: string }).error ?? "tool_error"));
          return c.json(mcpToolResult(id, data));
        }

        case "get_scans": {
          const { patient_id } = args as { patient_id: string };
          const internalReq = new Request(`http://internal/patients/${patient_id}/scans`, {
            headers: { Authorization: auth },
          });
          const res = await externalApiRoutes.fetch(internalReq, c.env, getSafeExecCtx(c));
          const data = await res.json();
          if (!res.ok) return c.json(mcpToolError(id, (data as { error?: string }).error ?? "tool_error"));
          return c.json(mcpToolResult(id, data));
        }

        case "get_cultures": {
          const { patient_id } = args as { patient_id: string };
          const internalReq = new Request(`http://internal/patients/${patient_id}/cultures`, {
            headers: { Authorization: auth },
          });
          const res = await externalApiRoutes.fetch(internalReq, c.env, getSafeExecCtx(c));
          const data = await res.json();
          if (!res.ok) return c.json(mcpToolError(id, (data as { error?: string }).error ?? "tool_error"));
          return c.json(mcpToolResult(id, data));
        }

        case "log_vital": {
          const { patient_id, ...body } = args as {
            patient_id: string;
            type: string;
            value_primary: number;
            value_secondary?: number;
            measured_at?: string;
            dry_run?: boolean;
            confirmation_id?: string;
          };
          const internalReq = new Request(`http://internal/patients/${patient_id}/vitals`, {
            method: "POST",
            headers: {
              Authorization: auth,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          });
          const res = await externalApiRoutes.fetch(internalReq, c.env, getSafeExecCtx(c));
          const data = await res.json();
          if (!res.ok) return c.json(mcpToolError(id, (data as { error?: string }).error ?? "tool_error"));
          return c.json(mcpToolResult(id, data));
        }

        case "add_medication": {
          const { patient_id, ...body } = args as {
            patient_id: string;
            brand_name: string;
            generic_name?: string;
            dosage: string;
            form: string;
            start_date: string;
            reason?: string;
            dry_run?: boolean;
            confirmation_id?: string;
          };
          const internalReq = new Request(`http://internal/patients/${patient_id}/medications`, {
            method: "POST",
            headers: {
              Authorization: auth,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          });
          const res = await externalApiRoutes.fetch(internalReq, c.env, getSafeExecCtx(c));
          const data = await res.json();
          if (!res.ok) return c.json(mcpToolError(id, (data as { error?: string }).error ?? "tool_error"));
          return c.json(mcpToolResult(id, data));
        }

        case "add_note": {
          const { patient_id, ...body } = args as {
            patient_id: string;
            visit_date: string;
            doctor_name?: string;
            facility?: string;
            diagnosis?: string;
            summary?: string;
            treatment_plan?: string;
            dry_run?: boolean;
            confirmation_id?: string;
          };
          const internalReq = new Request(`http://internal/patients/${patient_id}/notes`, {
            method: "POST",
            headers: {
              Authorization: auth,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          });
          const res = await externalApiRoutes.fetch(internalReq, c.env, getSafeExecCtx(c));
          const data = await res.json();
          if (!res.ok) return c.json(mcpToolError(id, (data as { error?: string }).error ?? "tool_error"));
          return c.json(mcpToolResult(id, data));
        }

        case "discontinue_medication": {
          // medication_id appears in both the URL path and the POST body because
          // DiscontinueMedicationParamsSchema requires it in the body for validation.
          const { patient_id, medication_id, ...rest } = args as {
            patient_id: string;
            medication_id: string;
            reason?: string;
            dry_run?: boolean;
            confirmation_id?: string;
          };
          const internalReq = new Request(
            `http://internal/patients/${patient_id}/medications/${medication_id}/discontinue`,
            {
              method: "POST",
              headers: {
                Authorization: auth,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ medication_id, ...rest }),
            }
          );
          const res = await externalApiRoutes.fetch(internalReq, c.env, getSafeExecCtx(c));
          const data = await res.json();
          if (!res.ok) return c.json(mcpToolError(id, (data as { error?: string }).error ?? "tool_error"));
          return c.json(mcpToolResult(id, data));
        }

        default:
          return c.json(jsonRpcError(id, -32601, "Method not found"));
      }
    }

    default:
      return c.json(jsonRpcError(id, -32601, "Method not found"));
  }
});

mcpApp.onError((err, c) => {
  return c.json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: err.message } });
});

// ─── Discovery route — GET /.well-known/mcp — no auth required ───────────────
// Mounted at the root of the main app in index.ts: app.route("", mcpDiscoveryRoute)

export const mcpDiscoveryRoute = new Hono<{ Bindings: Bindings }>();

mcpDiscoveryRoute.get("/.well-known/mcp", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json({
    name: "Family Health Dashboard",
    description: "MCP server for family health data",
    mcp_url: `${origin}/mcp`,
    auth: {
      type: "oauth2",
      authorization_url: `${origin}/oauth/authorize`,
      token_url: `${origin}/oauth/token`,
      registration_url: `${origin}/oauth/register`,
      scopes: ["mcp.read", "mcp.write"],
    },
  });
});
