# Family Health Dashboard

A self-hostable, AI-assisted health dashboard for families — runs entirely on Cloudflare's free tier.

Track lab results, vitals, medications, scans, and clinical notes for everyone in your household. Upload a PDF lab report and let AI extract the values; watch trends over time; keep medications organised.

<!-- TODO: add screenshots after first deploy -->

---

## What it does

- **Lab result trends** — upload PDF lab reports; AI extracts values and plots them over time with reference-range bands
- **Vitals tracking** — log blood pressure, weight, temperature, SpO₂, blood glucose, and more
- **Medication manager** — track active meds, dosing schedules, prescription history, and daily pillbox view
- **Clinical documents** — store scans, prescriptions, consultation notes, and culture reports in Cloudflare R2
- **Voice notes** — dictate clinical notes; Deepgram transcribes them automatically (optional)
- **Multi-patient** — manage separate records for each family member with per-patient access control
- **Daily backup** — nightly D1 SQL + R2 manifest committed to a private GitHub repo (optional)

---

## What it costs

Everything runs on free tiers for a typical family (a handful of patients, a few PDF uploads per month):

| Service | Free tier | Notes |
|---|---|---|
| Cloudflare Workers | 100,000 req/day | More than enough for personal use |
| Cloudflare D1 | 5 GB, 25M row reads/day | Generous for personal records |
| Cloudflare R2 | 10 GB storage, 1M reads/mo | Covers years of PDF storage |
| Cloudflare Pages | Unlimited sites | Hosts the React frontend |
| Cloudflare AI Gateway | Free | Proxies all LLM calls |
| Cloudflare Turnstile | Free | Bot protection on login |
| Google AI Studio | Free (generous limits) | Gemini 2.5 Flash for extraction |
| Anthropic | ~$1–5 / month | Claude Haiku for disambiguation |
| Deepgram (optional) | $0–2 / month | Voice note transcription |

Total: **$0–5/month** for most families.

---

## Architecture at a glance

```
React SPA (Cloudflare Pages)
    │
    └─► /api/* (Pages Function proxy)
            │
            └─► Hono Worker (Cloudflare Workers)
                    ├── D1 (SQLite — patients, results, meds, notes)
                    ├── R2 (files — PDF reports, scans, documents)
                    ├── Cloudflare Workflow (async PDF extraction pipeline)
                    └── AI Gateway → Gemini 2.5 Flash / Claude Haiku / GPT-4.1
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full breakdown.

---

## Requirements

- A free [Cloudflare account](https://dash.cloudflare.com/sign-up)
- A free [GitHub account](https://github.com/join)
- Node 20+ (for local development and CLI deployment)
- About 30–45 minutes

---

## Quickstart

1. [Fork this repo](https://github.com/jamesramya/family-health-dashboard-oss/fork) on GitHub
2. Follow **[docs/SETUP.md](docs/SETUP.md)** — it walks you through every step
3. Visit `/setup` on your deployed URL to create your first admin user

---

## Not medical advice

This software is a personal record-keeping tool. It is **not** a medical device and does not provide medical advice. AI extractions can contain errors; reference ranges are approximate. Always verify important values against the source document and consult a qualified healthcare professional before making any medical decisions.

See [NOT-MEDICAL-ADVICE.md](NOT-MEDICAL-ADVICE.md) for the full disclaimer.

---

## License

[MIT](LICENSE) — © 2026 James Ramya
