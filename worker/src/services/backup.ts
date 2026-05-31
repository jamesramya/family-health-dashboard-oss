import type { Bindings } from "../types";

export interface BackupData {
  tables: {
    users: unknown[];
    patient: unknown[];
    documents: unknown[];
    test_definitions: unknown[];
    test_results: unknown[];
    vital_readings: unknown[];
    scan_findings: unknown[];
    medications: unknown[];
    medication_schedules: unknown[];
    clinical_notes: unknown[];
    purge_log: unknown[];
    system_settings: unknown[];
    user_patient_access: unknown[];
  };
  exported_at: string;
  environment: string;
}

export async function collectBackupData(db: D1Database, environment: string): Promise<BackupData> {
  const [
    users,
    patients,
    documents,
    testDefinitions,
    testResults,
    vitalReadings,
    scanFindings,
    medications,
    medicationSchedules,
    clinicalNotes,
    purgeLog,
    systemSettings,
    userPatientAccess,
  ] = await Promise.all([
    db.prepare("SELECT id, email, role, display_name, is_super_admin, must_change_pw, created_at, updated_at FROM users").all(),
    db.prepare("SELECT * FROM patient").all(),
    db.prepare("SELECT * FROM documents").all(),
    db.prepare("SELECT * FROM test_definitions").all(),
    db.prepare("SELECT * FROM test_results").all(),
    db.prepare("SELECT * FROM vital_readings").all(),
    db.prepare("SELECT * FROM scan_findings").all(),
    db.prepare("SELECT * FROM medications").all(),
    db.prepare("SELECT * FROM medication_schedules").all(),
    db.prepare("SELECT * FROM clinical_notes").all(),
    db.prepare("SELECT * FROM purge_log").all(),
    db.prepare("SELECT key, updated_at FROM system_settings").all(), // exclude sensitive values
    db.prepare("SELECT * FROM user_patient_access").all(),
  ]);

  return {
    tables: {
      users: users.results,
      patient: patients.results,
      documents: documents.results,
      test_definitions: testDefinitions.results,
      test_results: testResults.results,
      vital_readings: vitalReadings.results,
      scan_findings: scanFindings.results,
      medications: medications.results,
      medication_schedules: medicationSchedules.results,
      clinical_notes: clinicalNotes.results,
      purge_log: purgeLog.results,
      system_settings: systemSettings.results,
      user_patient_access: userPatientAccess.results,
    },
    exported_at: new Date().toISOString(),
    environment,
  };
}

function toBase64(str: string): string {
  // Encode Unicode string to base64 via UTF-8 bytes
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function getGitHubFileSha(
  token: string,
  repo: string,
  path: string,
): Promise<string | undefined> {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "family-health-dashboard-backup",
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) return undefined;
  const data = await res.json() as { sha?: string };
  return data.sha;
}

async function commitToGitHub(
  token: string,
  repo: string,
  path: string,
  content: string, // base64 encoded
  message: string,
): Promise<void> {
  const sha = await getGitHubFileSha(token, repo, path);

  const body: Record<string, string> = { message, content };
  if (sha) body.sha = sha;

  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "family-health-dashboard-backup",
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub commit failed (${res.status}): ${err.slice(0, 200)}`);
  }
}

export async function runBackup(env: Bindings): Promise<{ r2: boolean; github: boolean }> {
  const environment = env.ENVIRONMENT ?? "unknown";
  const data = await collectBackupData(env.DB, environment);
  const json = JSON.stringify(data, null, 2);

  // e.g. "2026-03-21T03-00-00Z"
  const timestamp = data.exported_at.replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z");
  const date = data.exported_at.slice(0, 10); // YYYY-MM-DD for organising by date
  const filename = `${timestamp}.json`;
  const r2Key = `backups/${environment}/${date}/${filename}`;
  const result = { r2: false, github: false };

  // --- R2 backup ---
  try {
    await env.BUCKET.put(r2Key, json, {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { exported_at: data.exported_at },
    });
    result.r2 = true;
    console.log(`[backup] R2 upload OK: ${r2Key}`);
  } catch (err) {
    console.log(`[backup] R2 upload failed: ${err}`);
  }

  // --- GitHub backup ---
  const githubToken = env.GITHUB_TOKEN;
  const githubRepo = env.GITHUB_REPO; // e.g. "james-ramya/health-backups"

  if (githubToken && githubRepo) {
    try {
      const encoded = toBase64(json);
      const path = `backups/${environment}/${date}/${filename}`;
      const message = `backup: ${environment} ${timestamp}`;
      await commitToGitHub(githubToken, githubRepo, path, encoded, message);
      result.github = true;
      console.log(`[backup] GitHub commit OK: ${githubRepo}/${path}`);
    } catch (err) {
      console.log(`[backup] GitHub commit failed: ${err}`);
    }
  } else {
    console.log("[backup] GitHub skipped: GITHUB_TOKEN or GITHUB_REPO not set");
  }

  return result;
}
