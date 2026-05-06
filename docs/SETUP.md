# Setup Guide

By the end of this guide you will have a working, private deployment of the Family Health Dashboard — live at a real URL, with an admin account you can log into, ready to accept your first patient and PDF upload.

**Time required:** ~30–45 minutes  
**Cost:** $0 within free tiers (see the cost table in the README)

---

## Before you start

**What you'll need:**

| Requirement | Notes |
|---|---|
| Cloudflare account | Free at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) |
| GitHub account | Free at [github.com/join](https://github.com/join) |
| Node 20+ (CLI track only) | Check with `node -v`; install from [nodejs.org](https://nodejs.org) |
| A terminal (CLI track only) | Terminal.app on macOS, Command Prompt / WSL on Windows |

**Two parallel tracks:** Each step below has two paths. Choose one and stick with it:

- 🖱️ **Dashboard track** — do everything through the Cloudflare web dashboard. No command line needed, but a few steps (D1 migrations, deploying the Worker) still require one terminal command.
- 💻 **CLI track** — use `wrangler` (Cloudflare's command-line tool) for most steps. Faster once you're comfortable.

---

## Step 1: Fork and clone the repository

**Both tracks:**

1. Go to [github.com/jamesramya/family-health-dashboard-oss](https://github.com/jamesramya/family-health-dashboard-oss)
2. Click **Fork** (top right) → **Create fork**
3. You now have your own copy at `github.com/<your-username>/family-health-dashboard-oss`

**💻 CLI track — also clone it:**

```bash
git clone https://github.com/<your-username>/family-health-dashboard-oss.git
cd family-health-dashboard-oss
npm install
```

**🖱️ Dashboard track:** You don't need to clone yet — most of Step 2 happens in the browser.

---

## Step 2: Provision Cloudflare resources

You need to create:

- 2× **D1 databases** (Cloudflare's built-in SQLite — where your health data lives)
- 2× **R2 buckets** (Cloudflare's object storage — where PDF files are stored)
- 1× **AI Gateway** (proxies all AI API calls — free, adds observability)
- 1× **Turnstile site** (bot protection on the login page — free)
- 2× **Cloudflare Pages projects** (hosts the React frontend)

One each for staging (your test environment) and production (your real environment).

---

### 2a. Create D1 databases

**D1** is Cloudflare's serverless SQLite database. Your patient records, lab results, medications, and notes all live here.

#### 🖱️ Dashboard

1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com)
2. In the left sidebar: **Workers & Pages** → **D1**
3. Click **Create database**
4. Name it exactly: `family-health-dashboard-db-staging`
5. Click **Create** and copy the **Database ID** shown (looks like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) — you'll need it in Step 3
6. Repeat for the production database. Name it: `family-health-dashboard-db`
7. Copy its **Database ID** too

#### 💻 CLI

```bash
# Install wrangler if you don't have it
npm install -g wrangler

# Log in to Cloudflare
wrangler login

# Create staging database — copy the printed database_id
wrangler d1 create family-health-dashboard-db-staging

# Create production database — copy the printed database_id
wrangler d1 create family-health-dashboard-db
```

Each command prints something like:

```
✅ Successfully created DB 'family-health-dashboard-db-staging'

[[d1_databases]]
binding = "DB"
database_name = "family-health-dashboard-db-staging"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy both `database_id` values — you'll paste them into `worker/wrangler.toml` in Step 3.

---

### 2b. Create R2 buckets

**R2** is Cloudflare's object storage. Your PDF lab reports, scans, and other documents are stored here.

#### 🖱️ Dashboard

1. In the left sidebar: **R2 Object Storage**
2. Click **Create bucket**
3. Name it exactly: `family-health-dashboard-files-staging` → **Create bucket**
4. Repeat: `family-health-dashboard-files` → **Create bucket**

#### 💻 CLI

```bash
wrangler r2 bucket create family-health-dashboard-files-staging
wrangler r2 bucket create family-health-dashboard-files
```

---

### 2c. Create an AI Gateway

**AI Gateway** is a free Cloudflare proxy that sits in front of your AI API calls (Gemini, Claude, GPT). It adds rate limiting, caching, and usage logging without touching your code.

#### 🖱️ Dashboard (only — no CLI for AI Gateway yet)

1. In the left sidebar: **AI** → **AI Gateway**
2. Click **Create Gateway**
3. Name it exactly: `family-health-dashboard`
4. Click **Create**
5. Copy the **Gateway URL** shown — it looks like:
   `https://gateway.ai.cloudflare.com/v1/<YOUR_ACCOUNT_ID>/family-health-dashboard`
6. Note your **Account ID** from that URL (the part between `/v1/` and `/family-health-dashboard`) — you'll need it in Step 3

---

### 2d. Create a Turnstile site

**Turnstile** is Cloudflare's free, privacy-friendly CAPTCHA alternative. It protects the login and setup pages from bots.

#### 🖱️ Dashboard (only — no CLI for Turnstile yet)

1. In the left sidebar: **Turnstile**
2. Click **Add site**
3. Give it a name (e.g. "Family Health Dashboard")
4. Under Widget type: select **Managed** (recommended)
5. For Domains, add your Pages URLs:
   - `family-health-dashboard-staging.pages.dev`
   - `family-health-dashboard.pages.dev`
   - (You can also add your own custom domain later)
6. Click **Create**
7. Copy the **Site Key** and the **Secret Key** — you'll need both in Step 4

---

### 2e. Create Cloudflare Pages projects

**Cloudflare Pages** hosts the React frontend. When you push code, GitHub Actions builds and deploys it automatically.

#### 🖱️ Dashboard

1. In the left sidebar: **Workers & Pages**
2. Click **Create application** → **Pages** → **Connect to Git**
3. Connect your GitHub account if prompted, then select your fork of `family-health-dashboard-oss`
4. Configure the build:
   - **Project name:** `family-health-dashboard-staging`
   - **Production branch:** `staging`
   - **Build command:** `npm run build --workspace=app`
   - **Build output directory:** `app/dist`
5. Under **Environment variables** (before saving), add:
   - `API_URL` = (leave blank for now — you'll fill this in after the Worker is deployed in Step 6)
   - `VITE_TURNSTILE_SITE_KEY` = (your Turnstile site key from Step 2d)
6. Click **Save and Deploy** (the first deploy will fail because `API_URL` is empty — that's expected; you'll fix it after Step 6)
7. Repeat for production:
   - **Project name:** `family-health-dashboard`
   - **Production branch:** `master`

#### 💻 CLI

Pages projects are easiest to create via the dashboard (above). The CLI can deploy to an existing project but can't set environment variables for a new one's first deployment.

---

## Step 3: Edit `worker/wrangler.toml`

Now that you have your database IDs and account ID, open `worker/wrangler.toml` in a text editor and replace the three placeholders:

```toml
# Find these three lines and replace the angle-bracket values:

AI_GATEWAY_URL = "https://gateway.ai.cloudflare.com/v1/<YOUR_CLOUDFLARE_ACCOUNT_ID>/family-health-dashboard"
#                                                         ^^^^^^^^^^^^^^^^^^^^^^^^^
#                                                         Replace with your account ID from Step 2c

database_id = "<YOUR_STAGING_D1_DATABASE_ID>"
#              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#              Replace with the staging database_id from Step 2a

database_id = "<YOUR_PRODUCTION_D1_DATABASE_ID>"
#              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#              Replace with the production database_id from Step 2a
```

Save the file. There are three occurrences of `<YOUR_CLOUDFLARE_ACCOUNT_ID>` (one per environment block) and one each for the staging and production D1 IDs.

Commit the change:

```bash
git add worker/wrangler.toml
git commit -m "chore: add cloudflare resource IDs"
```

---

## Step 4: Configure secrets

Secrets are sensitive values that should **never** be committed to git. There are two places they go:

1. **Worker secrets** — set on the Cloudflare Worker for each environment
2. **GitHub Actions secrets** — used by CI/CD to build and deploy

---

### 4a. Worker secrets

| Secret | Description | How to get it | Required? |
|---|---|---|---|
| `JWT_SECRET` | Signs login tokens | `openssl rand -hex 32` (run in your terminal) | Required |
| `TURNSTILE_SECRET_KEY` | Validates Turnstile challenges | From Step 2d | Required |
| `CORS_ORIGIN` | The Pages URL that's allowed to call the Worker | e.g. `https://family-health-dashboard-staging.pages.dev` | Required |
| `GOOGLE_API_KEY` | Gemini model for PDF extraction | [aistudio.google.com](https://aistudio.google.com) → Get API key (free) | Required |
| `ANTHROPIC_API_KEY` | Claude Haiku for disambiguation | [console.anthropic.com](https://console.anthropic.com) → API keys | Required |
| `OPENAI_API_KEY` | GPT-4.1 fallback for extraction | [platform.openai.com](https://platform.openai.com) | Optional |
| `DEEPGRAM_API_KEY` | Voice note transcription | [console.deepgram.com](https://console.deepgram.com) | Optional |
| `GITHUB_TOKEN` | Nightly database backup | GitHub → Settings → Developer settings → Personal access tokens (needs `repo` scope on a private repo you create) | Optional |
| `GITHUB_REPO` | Target repo for backup | e.g. `your-username/health-backup` (must be private) | Optional (if using backup) |

Set each secret for both `staging` and `production` environments.

#### 🖱️ Dashboard

1. Go to **Workers & Pages** → `family-health-dashboard-api-staging`
2. Click **Settings** → **Variables and Secrets**
3. Under **Secrets**, click **Add** → enter the name and value → **Deploy**
4. Repeat for each secret
5. Repeat steps 1–4 for `family-health-dashboard-api` (the production Worker)

#### 💻 CLI

```bash
cd worker

# Generate a strong JWT secret
openssl rand -hex 32

# Set each secret — replace the value in quotes
wrangler secret put JWT_SECRET --env staging
# (prompts for the value)

wrangler secret put TURNSTILE_SECRET_KEY --env staging
wrangler secret put CORS_ORIGIN --env staging
wrangler secret put GOOGLE_API_KEY --env staging
wrangler secret put ANTHROPIC_API_KEY --env staging

# Repeat for production:
wrangler secret put JWT_SECRET --env production
wrangler secret put TURNSTILE_SECRET_KEY --env production
wrangler secret put CORS_ORIGIN --env production   # use the production Pages URL
wrangler secret put GOOGLE_API_KEY --env production
wrangler secret put ANTHROPIC_API_KEY --env production
```

---

### 4b. GitHub Actions secrets

These are only needed if you want the GitHub Actions push-to-deploy workflow to work. If you plan to deploy manually via CLI, you can skip this subsection.

Go to your fork on GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret name | How to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → **My Profile** → **API Tokens** → **Create Token** → use the "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare → **Workers & Pages** → the account ID shown in the right sidebar (or from the AI Gateway URL in Step 2c) |
| `STAGING_TURNSTILE_SITE_KEY` | Your Turnstile site key from Step 2d |
| `PRODUCTION_TURNSTILE_SITE_KEY` | Same key (or a separate Turnstile site if you want separate keys per environment) |

---

### 4c. Pages environment variables

Still needed even with GitHub Actions:

#### 🖱️ Dashboard

1. **Workers & Pages** → `family-health-dashboard-staging` → **Settings** → **Environment variables**
2. Add variable: `VITE_TURNSTILE_SITE_KEY` = your Turnstile site key
3. After the Worker is deployed (Step 6), come back and add: `API_URL` = `https://family-health-dashboard-api-staging.<your-account-subdomain>.workers.dev`
4. Repeat for the production Pages project

> **Where to find the Worker URL:** After deploying the Worker (Step 6), go to **Workers & Pages** → click your Worker → the URL is shown at the top.

---

## Step 5: Apply database migrations

This step creates all the tables in your D1 databases. It requires the CLI — there is no dashboard equivalent for running SQL migrations.

```bash
cd worker

# Apply to staging first
npx wrangler d1 migrations apply family-health-dashboard-db-staging --env staging --remote

# Once staging looks good, apply to production
npx wrangler d1 migrations apply family-health-dashboard-db --env production --remote
```

Expected output: a list of 11 SQL migration files applied in order, with `✅ Applied migration` for each.

If you see an error about the database not existing, double-check that the `database_id` in `wrangler.toml` matches what wrangler printed when you created the database in Step 2a.

---

## Step 6: Deploy

### Easiest: push code to trigger GitHub Actions

Once you've set up the GitHub Actions secrets in Step 4b, a git push is all you need:

```bash
# Deploy to staging (push to staging branch):
git push origin master:staging

# After verifying staging works, deploy to production:
git push origin master
```

GitHub Actions (`deploy-v2.yml`) will:
1. Run tests
2. Apply any new D1 migrations
3. Deploy the Hono Worker to Cloudflare
4. Build the React app and deploy to Cloudflare Pages

Watch the progress at `github.com/<your-username>/family-health-dashboard-oss/actions`.

---

### Manual CLI alternative

If you prefer not to use GitHub Actions:

```bash
# Deploy the Worker
cd worker
npx wrangler deploy --env staging

# Note the Worker URL printed (e.g. https://family-health-dashboard-api-staging.xxx.workers.dev)
# Set it as the API_URL Pages environment variable (Step 4c above), then:

# Build and deploy the frontend
cd ../app
npm install
npm run build
npx wrangler pages deploy dist --project-name=family-health-dashboard-staging
```

---

## Step 7: Bootstrap the first admin

After the first deploy completes, you need to create the initial admin account.

> **This can only be done once.** The `/setup` route is disabled after the first admin is created.

1. Open your staging Pages URL: `https://family-health-dashboard-staging.pages.dev/setup`
   - (Or your custom domain if you've set one up)
2. Fill in your name, email address, and a strong password
3. Complete the Turnstile challenge
4. Click **Create admin account**
5. You'll be redirected to the login page

Log in with the email and password you just set. You're in.

To invite other family members later, go to **Settings** → **Users** → **Invite user**.

---

## Step 8: Add your first patient and upload a lab report

1. Click **Add Patient** (on the Dashboard or in Settings → Patients)
2. Enter the patient's name, date of birth, and sex
3. Click **Save**
4. Select the patient from the family strip at the top
5. Click **Documents** → **Upload** → select a PDF lab report from your computer
6. Wait ~30 seconds for extraction to complete (the status changes from "Processing" to "Done")
7. Go to **Blood Work** to see the extracted values plotted over time

> **Tip:** The first upload is the most important one — it seeds the reference ranges and test-name catalog. If extraction looks wrong, you can review and correct it in the **Admin** → **Review Queue**.

---

## Updating your deployment later

To pull future improvements from the upstream repo:

```bash
# Add the upstream remote (one-time setup)
git remote add upstream https://github.com/jamesramya/family-health-dashboard-oss.git

# Pull updates
git fetch upstream
git merge upstream/master

# Push to deploy
git push origin master:staging   # staging first
git push origin master           # then production
```

If new D1 migrations are included, the GitHub Actions deploy workflow applies them automatically. If deploying manually, run `wrangler d1 migrations apply` again (Step 5) before deploying the Worker.

---

## Troubleshooting

**"wrangler: command not found"**  
Use `npx wrangler` instead of `wrangler`. Or install globally: `npm install -g wrangler`.

**Pages build fails with "API_URL is undefined"**  
The `API_URL` environment variable is not set on your Pages project. Go to the Pages project settings → Environment variables and add it (the Worker URL from Step 6).

**"401 Unauthorized" on API calls**  
The `CORS_ORIGIN` Worker secret doesn't match your Pages URL. Check that they're identical (including `https://` and no trailing slash).

**"AI Gateway returned 404"**  
The `AI_GATEWAY_URL` in `wrangler.toml` still has a placeholder. Make sure you replaced `<YOUR_CLOUDFLARE_ACCOUNT_ID>` with your actual Cloudflare account ID.

**D1 migration fails**  
Check that the `database_id` in `wrangler.toml` exactly matches the ID shown in the Cloudflare dashboard for that D1 database. The staging and production IDs must go in the correct `[env.staging]` and `[env.production]` sections.

**Login page shows "Turnstile failed"**  
The `TURNSTILE_SECRET_KEY` Worker secret and the `VITE_TURNSTILE_SITE_KEY` Pages environment variable must match the same Turnstile site. Check both are set and that your Pages URL is listed in the Turnstile site's allowed domains.

**"Setup page is disabled"**  
The `/setup` route only works before the first admin is created. If you need to access it again (e.g. you're starting fresh), you'll need to delete all rows from the `users` table in D1 via the Cloudflare dashboard: **Workers & Pages** → **D1** → your database → **Console** → run `DELETE FROM users;`.

**wrangler errors on macOS 11 (Big Sur)**  
Use exactly wrangler 3.78.0: `npm install -g wrangler@3.78.0`. Newer versions require a newer macOS.

---

## Cost expectations

For a typical family (2–4 patients, a few PDF uploads per month):

| Service | Expected cost |
|---|---|
| Cloudflare (Workers, D1, R2, Pages, Gateway, Turnstile) | $0/month |
| Google AI Studio (Gemini 2.5 Flash, extraction) | $0/month (free tier covers thousands of pages) |
| Anthropic (Claude Haiku, disambiguation) | ~$1–5/month |
| Deepgram (optional, voice notes) | $0–2/month |

If your usage grows significantly (hundreds of uploads per month, many patients), you may need the Cloudflare Workers Paid plan ($5/month) for more CPU time per request. The app will continue to work on the free plan for typical personal use.

---

## Not medical advice

This software is a personal record-keeping tool. It is **not** a medical device and does not provide medical advice. See [NOT-MEDICAL-ADVICE.md](../NOT-MEDICAL-ADVICE.md) for the full disclaimer.
