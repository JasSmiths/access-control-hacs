import "server-only";
import { getDb } from "./db";

const HOME_ASSISTANT_INTEGRATION_KEY = "home_assistant";
const STALE_AFTER_MS = 2 * 60 * 1000;

export type HomeAssistantHeartbeat = {
  integration_key: string;
  source: "poll" | "stream";
  heartbeat_ms: number;
  snapshot_generated_at: string;
  measured_at: string;
  updated_at: string;
};

export function recordHomeAssistantHeartbeat(args: {
  source: "poll" | "stream";
  heartbeatMs: number;
  snapshotGeneratedAt: string;
  measuredAt: string;
}) {
  const now = new Date().toISOString();

  getDb()
    .prepare(
      `INSERT INTO integration_heartbeats (
         integration_key,
         source,
         heartbeat_ms,
         snapshot_generated_at,
         measured_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(integration_key) DO UPDATE SET
         source = excluded.source,
         heartbeat_ms = excluded.heartbeat_ms,
         snapshot_generated_at = excluded.snapshot_generated_at,
         measured_at = excluded.measured_at,
         updated_at = excluded.updated_at`
    )
    .run(
      HOME_ASSISTANT_INTEGRATION_KEY,
      args.source,
      Math.max(0, Math.round(args.heartbeatMs)),
      args.snapshotGeneratedAt,
      args.measuredAt,
      now
    );
}

export function getHomeAssistantHeartbeat(): HomeAssistantHeartbeat | null {
  const row = getDb()
    .prepare(
      `SELECT integration_key,
              source,
              heartbeat_ms,
              snapshot_generated_at,
              measured_at,
              updated_at
         FROM integration_heartbeats
        WHERE integration_key = ?`
    )
    .get(HOME_ASSISTANT_INTEGRATION_KEY) as HomeAssistantHeartbeat | undefined;

  return row ?? null;
}

export function getHomeAssistantHeartbeatStatus(now = Date.now()) {
  const heartbeat = getHomeAssistantHeartbeat();
  if (!heartbeat) {
    return {
      heartbeat: null,
      age_ms: null,
      is_stale: true,
    };
  }

  const updatedAtMs = Date.parse(heartbeat.updated_at);
  const ageMs = Number.isFinite(updatedAtMs) ? Math.max(0, now - updatedAtMs) : null;

  return {
    heartbeat,
    age_ms: ageMs,
    is_stale: ageMs == null ? true : ageMs > STALE_AFTER_MS,
  };
}
