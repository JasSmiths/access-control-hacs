import "server-only";
import { emit } from "./events-bus";
import { getDb } from "./db";
import { getClientIp, getPathname } from "./request";
import type { LogLevel } from "./shared-types";

type AuditLevel = LogLevel;

type AuditInput = {
  level?: AuditLevel;
  category: string;
  action: string;
  message: string;
  request?: Request;
  ip?: string | null;
  method?: string | null;
  path?: string | null;
  actor?: string | null;
  contractorId?: number | null;
  plate?: string | null;
  deviceId?: string | null;
  eventId?: string | null;
  details?: unknown;
};

const LEVEL_ORDER: Record<AuditLevel, number> = {
  debug: 10,
  info: 20,
  error: 30,
};

function resolveMinAuditLevel(): AuditLevel {
  const configured = getConfiguredAuditLogLevel();
  return configured === "errors" ? "error" : "debug";
}

export function getConfiguredAuditLogLevel(): "errors" | "debug" {
  try {
    const row = getDb()
      .prepare("SELECT log_level FROM settings WHERE id = 1")
      .get() as { log_level?: string | null } | undefined;
    const value = row?.log_level?.trim().toLowerCase() ?? "";
    if (value === "errors" || value === "debug") return value;
  } catch {
    // Fallback for bootstrap or pre-migration states.
  }

  const raw = String(process.env.AUDIT_LOG_LEVEL ?? process.env.LOG_LEVEL ?? "debug")
    .trim()
    .toLowerCase();
  if (raw === "errors" || raw === "error") return "errors";
  return "debug";
}

function shouldPersistLevel(level: AuditLevel): boolean {
  const minLevel = resolveMinAuditLevel();
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

export function auditLog(input: AuditInput): number | null {
  try {
    const level = input.level ?? "info";
    if (!shouldPersistLevel(level)) return null;

    const request = input.request;
    const ip = input.ip ?? (request ? getClientIp(request) : null);
    const method = input.method ?? (request ? request.method : null);
    const path = input.path ?? (request ? getPathname(request) : null);
    const detailsJson =
      input.details === undefined ? null : JSON.stringify(input.details);

    const result = getDb()
      .prepare(
        `INSERT INTO audit_logs
          (level, category, action, message, ip, method, path, actor, contractor_id, plate, device_id, event_id, details_json)
         VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        level,
        input.category,
        input.action,
        input.message,
        ip ?? null,
        method ?? null,
        path ?? null,
        input.actor ?? null,
        input.contractorId ?? null,
        input.plate ?? null,
        input.deviceId ?? null,
        input.eventId ?? null,
        detailsJson
      );

    const id = Number(result.lastInsertRowid);
    emit("log.created", { id });
    return id;
  } catch {
    return null;
  }
}
