-- 0009_note_audio_fields.sql
ALTER TABLE clinical_notes ADD COLUMN audio_r2_key TEXT;
ALTER TABLE clinical_notes ADD COLUMN audio_transcript TEXT;
ALTER TABLE clinical_notes ADD COLUMN audio_duration_sec INTEGER;
