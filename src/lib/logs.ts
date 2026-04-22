import "server-only";
import { getDb } from "./db";
import type { LogRow, LogsPageResult } from "./shared-types";

export function loadLogs(limit = 200): LogRow[] {
  const safeLimit = Math.min(1000, Math.max(1, limit));
  return getDb()
    .prepare(
      `SELECT l.id, l.occurred_at, l.level, l.category, l.action, l.message,
              l.ip, l.method, l.path, l.actor, l.contractor_id, l.plate,
              l.device_id, d.name AS device_name, l.event_id, l.details_json
         FROM audit_logs l
         LEFT JOIN integration_devices d ON d.device_id = l.device_id
        ORDER BY l.occurred_at DESC, l.id DESC
        LIMIT ?`
    )
    .all(safeLimit) as LogRow[];
}

export function loadLogsPage(page = 1, pageSize = 10): LogsPageResult {
  const safePageSize = Math.min(100, Math.max(1, pageSize));
  const count = (
    getDb().prepare("SELECT COUNT(*) AS n FROM audit_logs").get() as { n: number }
  ).n;
  const totalPages = Math.max(1, Math.ceil(count / safePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * safePageSize;

  const rows = getDb()
    .prepare(
      `SELECT l.id, l.occurred_at, l.level, l.category, l.action, l.message,
              l.ip, l.method, l.path, l.actor, l.contractor_id, l.plate,
              l.device_id, d.name AS device_name, l.event_id, l.details_json
         FROM audit_logs l
         LEFT JOIN integration_devices d ON d.device_id = l.device_id
        ORDER BY l.occurred_at DESC, l.id DESC
        LIMIT ? OFFSET ?`
    )
    .all(safePageSize, offset) as LogRow[];

  const logSizeBytes = getAuditLogSizeBytes();

  return {
    rows,
    count,
    page: safePage,
    pageSize: safePageSize,
    logSizeBytes,
  };
}

export function upsertDeviceName(deviceId: string, name: string) {
  getDb()
    .prepare(
      `INSERT INTO integration_devices (device_id, name, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(device_id) DO UPDATE SET
         name = excluded.name,
         updated_at = datetime('now')`
    )
    .run(deviceId, name);
}

export function clearLogs(): number {
  const result = getDb().prepare("DELETE FROM audit_logs").run();
  return result.changes;
}

function getAuditLogSizeBytes(): number {
  try {
    const row = getDb()
      .prepare(
        `SELECT COALESCE(SUM(pgsize), 0) AS n
         FROM dbstat
         WHERE name IN (
           'audit_logs',
           'idx_audit_logs_occurred',
           'idx_audit_logs_category',
           'idx_audit_logs_device'
         )`
      )
      .get() as { n: number };
    if (Number.isFinite(row.n) && row.n >= 0) return row.n;
  } catch {
    // Fallback below when dbstat is unavailable.
  }

  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(
          length(CAST(level AS BLOB)) +
          length(CAST(category AS BLOB)) +
          length(CAST(action AS BLOB)) +
          length(CAST(message AS BLOB)) +
          IFNULL(length(CAST(ip AS BLOB)), 0) +
          IFNULL(length(CAST(method AS BLOB)), 0) +
          IFNULL(length(CAST(path AS BLOB)), 0) +
          IFNULL(length(CAST(actor AS BLOB)), 0) +
          IFNULL(length(CAST(contractor_id AS BLOB)), 0) +
          IFNULL(length(CAST(plate AS BLOB)), 0) +
          IFNULL(length(CAST(device_id AS BLOB)), 0) +
          IFNULL(length(CAST(event_id AS BLOB)), 0) +
          IFNULL(length(CAST(details_json AS BLOB)), 0)
        ), 0) AS n
       FROM audit_logs`
    )
    .get() as { n: number };
  return row.n;
}
