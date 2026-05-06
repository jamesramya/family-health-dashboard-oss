export type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  EXTRACTION_WORKFLOW: Workflow;
  AI_GATEWAY_URL: string;
  TURNSTILE_SECRET_KEY: string;
  JWT_SECRET: string;
  CORS_ORIGIN: string;
  ENVIRONMENT: string;
  GOOGLE_API_KEY?: string;
  // Fallback NLP model (optional — vitals parsing falls back to GPT-4.1 nano if set)
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  DEEPGRAM_API_KEY?: string;
  // Backup (optional — backup skipped if not set)
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;  // e.g. "owner/repo"
};
