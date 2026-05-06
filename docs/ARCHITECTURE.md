# Architecture

This document describes how the Family Health Dashboard is structured — how the pieces fit together, how data flows, and where to look in the codebase when you want to change something.

---

## Component map

```
┌─────────────────────────────────────────────────────────────┐
│                    Your browser (React SPA)                 │
│   React 18 · react-router v6 · Tanstack Query · Recharts   │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              Cloudflare Pages (static hosting)              │
│   app/functions/api/[[path]].ts — proxies /api/* →         │
└────────────────────────────┬────────────────────────────────┘
                             │ Worker-to-Worker (internal)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│           Cloudflare Worker — Hono API (worker/src/)        │
│   Routes: /api/auth  /api/patients  /api/blood-work        │
│           /api/vitals  /api/medications  /api/documents     │
│           /api/scans  /api/notes  /api/cultures  /api/ai   │
│           /api/admin  /api/setup  /api/dashboard           │
└──────────┬─────────────────┬──────────────────┬────────────┘
           │                 │                  │
           ▼                 ▼                  ▼
┌──────────────────┐ ┌──────────────┐ ┌────────────────────┐
│   Cloudflare D1  │ │ Cloudflare   │ │  Cloudflare        │
│   (SQLite)       │ │ R2 (files)   │ │  Workflow          │
│                  │ │              │ │  (async extraction) │
│  patients        │ │  PDF reports │ │                     │
│  users           │ │  Scans       │ │  DocumentExtraction │
│  documents       │ │  Prescripts  │ │  Workflow           │
│  test_definitions│ │              │ │  worker/src/        │
│  test_results    │ └──────────────┘ │  workflows/         │
│  vitals          │                  │  document-          │
│  medications     │                  │  extraction.ts      │
│  med_schedules   │                  └────────┬───────────┘
│  notes           │                           │
│  scans           │                           ▼
│  cultures        │            ┌──────────────────────────┐
│  ...             │            │   Cloudflare AI Gateway  │
└──────────────────┘            │   (proxy + observability)│
                                └───────┬──────────────────┘
                                        │
                        ┌───────────────┼───────────────┐
                        ▼               ▼               ▼
               Google Gemini    Anthropic Claude    OpenAI GPT
               2.5 Flash        Haiku 4.5           4.1 mini
               (extraction)     (disambiguation)    (fallback)
```

---

## Data model

Key tables in D1 (defined in `worker/src/db/migrations/`):

| Table | Purpose |
|---|---|
| `users` | App accounts — email, hashed password, role (`super_admin`, `admin`, `viewer`) |
| `patients` | One row per family member — name, DOB, sex |
| `patient_access` | Many-to-many: which users can access which patients |
| `documents` | Metadata for each uploaded file — type, source lab, R2 key, extraction status |
| `test_definitions` | Lab test catalog — canonical name, category, unit, reference ranges per sex/age |
| `test_results` | Individual extracted values — linked to a document, patient, and test definition |
| `vitals` | Blood pressure, weight, temperature, SpO₂, blood glucose readings |
| `medications` | Active and past medications per patient |
| `medication_schedules` | Dosing schedule rows for each medication |
| `medication_lifecycle_events` | Start, pause, resume, stop events per medication |
| `notes` | Free-text and voice-transcribed clinical notes per patient |
| `scans` | Metadata and R2 key for scan images |
| `culture_results` | Culture report structured data |

---

## Extraction pipeline

When a user uploads a document, this is what happens:

```
1. User selects file(s) in the UI (app/src/components/documents/)
2. Worker /api/documents POST — uploads file to R2, creates document row (status: "pending")
3. Worker triggers DocumentExtractionWorkflow (worker/src/workflows/document-extraction.ts)
4. Workflow step 1: classify document (what type is it? blood_report, scan, prescription…)
5. Workflow step 2: extract structured data using Gemini 2.5 Flash via AI Gateway
   — prompts are in worker/src/services/extractor.ts
6. Workflow step 3: disambiguate test names against the canonical catalog
   — Claude Haiku via AI Gateway (worker/src/services/disambiguation-llm.ts)
7. Workflow step 4: arbitrate reference ranges
   — Claude Haiku again (worker/src/services/ref-range-arbiter.ts)
8. Workflow step 5: merge test results into D1
   — deduplication logic in worker/src/services/test-merger.ts
9. Document status updated to "done" (or "failed" if any step errored)
10. UI polls /api/documents until status changes, then refreshes blood-work data
```

Failed extractions appear in **Admin** → **Review Queue** where a super admin can correct extracted values.

---

## Auth flow

```
Login request
    │
    ▼
Cloudflare Turnstile challenge (bot protection)
    │
    ▼
POST /api/auth/login
    │
    ├── Verify Turnstile token with Cloudflare
    ├── Look up user by email in D1
    ├── Verify bcrypt password hash
    └── Issue JWT (HS256, signed with JWT_SECRET, 7-day expiry)
            │
            ▼
        Subsequent requests: Authorization: Bearer <token>
            │
            ▼
        worker/src/middleware/auth.ts — verifies JWT, attaches user to context
            │
            ▼
        worker/src/middleware/patient-access.ts — checks user has access to the
            requested patient_id (via patient_access table)
            │
            ▼
        worker/src/middleware/role.ts — enforces role-based permissions
            (super_admin > admin > viewer)
```

Password reset and user invitation are handled via one-time tokens stored in D1 and sent by email (requires an email provider — currently the app generates an invite link you copy and share manually).

---

## Background jobs

**Daily cleanup (03:00 UTC)** — `worker/src/scheduled.ts`  
Purges soft-deleted rows (documents, notes, etc.) older than 30 days.

**Nightly backup (02:00 UTC)** — `.github/workflows/backup-v2.yml`  
Exports the D1 database to SQL and lists R2 objects, then commits both to a private GitHub repo. Requires `GITHUB_TOKEN` and `GITHUB_REPO` Worker secrets.

---

## Key source files

| File | What it does |
|---|---|
| `worker/src/index.ts` | Worker entry point — mounts all routes, middleware |
| `worker/src/routes/` | One file per resource (blood-work, patients, documents, etc.) |
| `worker/src/services/extractor.ts` | AI extraction prompts and logic |
| `worker/src/services/disambiguation-llm.ts` | LLM-assisted test name matching |
| `worker/src/services/test-merger.ts` | Deduplication and merge into D1 |
| `worker/src/workflows/document-extraction.ts` | Cloudflare Workflow orchestration |
| `worker/src/db/migrations/` | SQL migration files (applied in order) |
| `worker/src/types.ts` | All TypeScript types, including the `Bindings` interface |
| `app/src/App.tsx` | React router root |
| `app/src/pages/` | Top-level page components |
| `app/src/components/` | Reusable UI components |
| `app/src/hooks/` | Data-fetching hooks (wrap Tanstack Query) |
| `app/functions/api/[[path]].ts` | Cloudflare Pages Function that proxies /api/* to the Worker |
