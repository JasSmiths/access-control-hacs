PRAGMA foreign_keys = ON;

DROP INDEX IF EXISTS idx_webhook_burst_candidates_ingest_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_burst_candidates_ingest_key_plate
  ON webhook_burst_candidates(ingest_key, plate_normalized)
  WHERE ingest_key IS NOT NULL;
