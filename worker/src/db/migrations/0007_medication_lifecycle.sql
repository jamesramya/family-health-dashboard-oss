-- 0007_medication_lifecycle.sql

-- Documents: prescription review tracking
ALTER TABLE documents ADD COLUMN medication_review_status TEXT
  CHECK (medication_review_status IN ('pending_review', 'reviewed'));
ALTER TABLE documents ADD COLUMN medication_review_decisions TEXT DEFAULT '[]';

-- Medications: lifecycle event log
ALTER TABLE medications ADD COLUMN lifecycle_events TEXT DEFAULT '[]';

-- Medications: multi-prescription linkage (replaces document_id as authoritative)
ALTER TABLE medications ADD COLUMN prescription_ids TEXT DEFAULT '[]';

-- Migrate existing document_id → prescription_ids
UPDATE medications SET prescription_ids = json_array(document_id)
  WHERE document_id IS NOT NULL;

-- Backfill lifecycle_events with a "started" event for existing meds (with document_id)
UPDATE medications SET lifecycle_events = json_array(
  json_object('event', 'started', 'date', start_date, 'document_id', document_id)
) WHERE is_deleted = 0 AND document_id IS NOT NULL;

-- Backfill lifecycle_events for manually-created meds (no document_id — omit the key)
UPDATE medications SET lifecycle_events = json_array(
  json_object('event', 'started', 'date', start_date)
) WHERE is_deleted = 0 AND document_id IS NULL;
