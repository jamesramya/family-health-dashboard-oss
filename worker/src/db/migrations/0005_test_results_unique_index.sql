-- Remove duplicate test_results rows. Keep earliest by rowid.
DELETE FROM test_results WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM test_results
  GROUP BY test_def_id, document_id, date
);

-- Drop the old partial index from 0003 which used different columns
DROP INDEX IF EXISTS idx_test_results_dedup;

-- Add compound unique index so INSERT OR IGNORE deduplicates on retry
CREATE UNIQUE INDEX IF NOT EXISTS idx_test_results_dedup
  ON test_results(test_def_id, document_id, date);
