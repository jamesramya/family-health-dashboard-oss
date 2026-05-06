import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { setupDb } from "../helpers/setup-db";

describe("migration 0009: clinical_notes audio columns", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
  });

  it("clinical_notes has audio_r2_key column", async () => {
    const row = await env.DB.prepare(
      "SELECT audio_r2_key FROM clinical_notes LIMIT 1"
    ).first();
    expect(row).toBeNull();
  });

  it("clinical_notes has audio_transcript column", async () => {
    const row = await env.DB.prepare(
      "SELECT audio_transcript FROM clinical_notes LIMIT 1"
    ).first();
    expect(row).toBeNull();
  });

  it("clinical_notes has audio_duration_sec column", async () => {
    const row = await env.DB.prepare(
      "SELECT audio_duration_sec FROM clinical_notes LIMIT 1"
    ).first();
    expect(row).toBeNull();
  });

  it("audio columns accept expected types", async () => {
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, role, display_name)
       VALUES ('u1','a@b.com','h','admin','Admin')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO patient (id, name, date_of_birth, gender, created_by, updated_by)
       VALUES ('p1','Test','2000-01-01','female','u1','u1')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO clinical_notes
         (id, patient_id, visit_date, summary, audio_r2_key, audio_transcript, audio_duration_sec, created_by, updated_by)
       VALUES ('n1','p1','2024-01-01','Test note','patients/p1/notes/n1/recording.webm','Hello world',42,'u1','u1')`
    ).run();
    const note = await env.DB.prepare(
      "SELECT audio_r2_key, audio_transcript, audio_duration_sec FROM clinical_notes WHERE id = 'n1'"
    ).first<{ audio_r2_key: string; audio_transcript: string; audio_duration_sec: number }>();
    expect(note?.audio_r2_key).toBe("patients/p1/notes/n1/recording.webm");
    expect(note?.audio_transcript).toBe("Hello world");
    expect(note?.audio_duration_sec).toBe(42);
  });
});
