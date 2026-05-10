# Configuration Reference

This document lists every secret and variable the application uses. Keep it open alongside `docs/SETUP.md` when provisioning a new deployment.

---

## Worker secrets

Set these with `wrangler secret put <NAME> --env <staging|production>` or via the Cloudflare dashboard (**Workers & Pages** → your Worker → **Settings** → **Variables and Secrets**).

Set them for **both** `staging` and `production` environments. The `CORS_ORIGIN` value will differ per environment.

| Secret | Required? | Description | How to generate / where to get it | Used in |
|---|---|---|---|---|
| `JWT_SECRET` | Required | Signs and verifies login tokens. Must be at least 32 bytes. | `openssl rand -hex 32` | `worker/src/services/jwt.ts`, `worker/src/middleware/auth.ts` |
| `TURNSTILE_SECRET_KEY` | Required | Server-side validation of Turnstile CAPTCHA challenges. | Cloudflare Dashboard → Turnstile → your site → Secret Key | `worker/src/services/turnstile.ts` |
| `CORS_ORIGIN` | Required | The exact origin URL of the frontend that's allowed to call the Worker. No trailing slash. | Your Pages URL, e.g. `https://family-health-dashboard-staging.pages.dev` | `worker/src/index.ts` |
| `GOOGLE_API_KEY` | Required (extraction) | Google AI Studio key for Gemini 2.5 Flash (primary extraction model). | [aistudio.google.com](https://aistudio.google.com) → Get API key | `worker/src/services/extractor.ts`, `worker/src/services/vitals-parser.ts` |
| `ANTHROPIC_API_KEY` | Required (extraction) | Anthropic API key for Claude Haiku (disambiguation and reference-range arbitration). | [console.anthropic.com](https://console.anthropic.com) → API keys | `worker/src/services/disambiguation-llm.ts`, `worker/src/services/ref-range-arbiter.ts` |
| `OPENAI_API_KEY` | Optional | OpenAI key for GPT-4.1 mini (fallback if Gemini fails). Without this, failed extractions will not be retried with a fallback model. | [platform.openai.com](https://platform.openai.com) | `worker/src/services/extractor.ts` |
| `DEEPGRAM_API_KEY` | Optional | Deepgram key for `nova-3` voice transcription. Voice notes are disabled if this is absent. | [console.deepgram.com](https://console.deepgram.com) | `worker/src/services/transcription.ts` |
| `GITHUB_TOKEN` | Optional (backup) | Fine-grained personal access token scoped only to the backup repository (contents: read/write). Nightly backup is disabled if absent. | GitHub → Settings → Developer settings → Personal access tokens (classic) | `worker/src/services/backup.ts` |
| `GITHUB_REPO` | Optional (backup) | The private GitHub repository that receives nightly backups, in the format `owner/repo`. | Create a private repo on GitHub and paste its name here | `worker/src/services/backup.ts` |

---

## Worker vars (non-secret, in `worker/wrangler.toml`)

These are set directly in `wrangler.toml` — they are not secrets and are safe to commit.

| Var | Description | Default value |
|---|---|---|
| `ENVIRONMENT` | Runtime environment string (`development`, `staging`, `production`). Used for feature flags and logging. | `development` (local), `staging`, `production` |
| `AI_GATEWAY_URL` | Full URL of your Cloudflare AI Gateway. All LLM calls are proxied through this. | `https://gateway.ai.cloudflare.com/v1/<YOUR_CLOUDFLARE_ACCOUNT_ID>/family-health-dashboard` |

---

## Cloudflare Pages environment variables

Set these in **Workers & Pages** → your Pages project → **Settings** → **Environment variables**.  
Set them for both the **Preview** and **Production** deployment environments.

| Variable | Required? | Description | Where to get the value |
|---|---|---|---|
| `API_URL` | Required | Full URL of the deployed Hono Worker that the Pages Function will proxy `/api/*` to. | After deploying the Worker (Step 6 of Setup), the Worker URL is shown in the Cloudflare dashboard under **Workers & Pages** → your Worker |
| `VITE_TURNSTILE_SITE_KEY` | Required | The **public** Turnstile site key (safe to expose in the browser). Shown on the login and setup pages. | Cloudflare Dashboard → Turnstile → your site → Site Key |

---

## GitHub Actions secrets

Set these in your fork's **Settings** → **Secrets and variables** → **Actions**.  
Only needed if you're using the push-to-deploy workflow (`deploy-v2.yml`).

| Secret | Description | Where to get it |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | API token with permissions to deploy Workers and Pages. | Cloudflare → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID. | Cloudflare → Workers & Pages → right sidebar, or from the AI Gateway URL |
| `STAGING_TURNSTILE_SITE_KEY` | Turnstile **public** site key for the staging Pages build. | Cloudflare Dashboard → Turnstile → your site → Site Key |
| `PRODUCTION_TURNSTILE_SITE_KEY` | Turnstile **public** site key for the production Pages build. | Same source (or a separate Turnstile site per env) |

---

## Local development

For local development, copy `worker/.dev.vars.example` to `worker/.dev.vars` and fill in at minimum:

```
JWT_SECRET=<any 32-char string>
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA   ← Cloudflare's always-pass test key
CORS_ORIGIN=http://localhost:5173
GOOGLE_API_KEY=<your key>
ANTHROPIC_API_KEY=<your key>
```

The Turnstile test key (`1x00…AA`) bypasses the CAPTCHA challenge locally. Never use it in production.

Run the Worker: `npm run dev:worker` (from the repo root)  
Run the frontend: `npm run dev:app` (from the repo root)

The frontend dev server (`http://localhost:5173`) proxies `/api/*` to the Worker dev server (`http://localhost:8787`) automatically.
