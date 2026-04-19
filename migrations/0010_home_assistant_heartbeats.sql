CREATE TABLE IF NOT EXISTS integration_heartbeats (
  integration_key       TEXT PRIMARY KEY,
  source                TEXT NOT NULL,
  heartbeat_ms          INTEGER NOT NULL CHECK (heartbeat_ms >= 0),
  snapshot_generated_at TEXT NOT NULL,
  measured_at           TEXT NOT NULL,
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
