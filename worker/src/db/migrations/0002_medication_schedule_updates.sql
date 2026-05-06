-- worker/src/db/migrations/0002_medication_schedule_updates.sql

-- Add days_of_week column. NULL means all seven days (backward-compatible).
ALTER TABLE medication_schedules ADD COLUMN days_of_week TEXT;

-- Change dose_quantity from REAL (numeric) to TEXT (free text like "1 tablet", "5ml").
-- SQLite cannot ALTER COLUMN type, so: add new column -> copy -> drop old -> rename.
ALTER TABLE medication_schedules ADD COLUMN dose_quantity_text TEXT;
UPDATE medication_schedules
  SET dose_quantity_text = CAST(dose_quantity AS TEXT)
  WHERE dose_quantity IS NOT NULL;
ALTER TABLE medication_schedules DROP COLUMN dose_quantity;
ALTER TABLE medication_schedules RENAME COLUMN dose_quantity_text TO dose_quantity;
