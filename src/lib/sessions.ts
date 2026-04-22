import "server-only";
import { auditLog } from "./audit";
import { getDb } from "./db";
import { emit } from "./events-bus";
import { checkAccessControl, sendNotification } from "./notifications";
import { getSettings } from "./settings";
import type { BusEvent } from "./shared-types";

export type SessionRow = {
  id: number;
  contractor_id: number;
  enter_event_id: number;
  exit_event_id: number | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  status: "open" | "closed" | "flagged";
  notes: string | null;
};

export type ContractorRow = {
  id: number;
  name: string;
  role: string | null;
  vehicle_reg: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: number;
  allowed_hours: string | null; // "HH:MM-HH:MM" or null
  allowed_days: string;         // "all" | "weekdays" | "weekends" | "custom:Mon,Tue,..."
  created_at: string;
  updated_at: string;
};

function parseEventTimestamp(raw: string): number {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? raw.replace(" ", "T") + "Z"
    : raw;
  return Date.parse(normalized);
}

function formatExitDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) {
    const parts = [`${d}d`, `${h}hrs`];
    if (m > 0) parts.push(`${m}m`);
    else if (sec > 0) parts.push(`${sec}s`);
    return parts.join(" ");
  }
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function normalizeNotifyType(role: string | null | undefined): "Family" | "Friend" | "Visitor" | "Contractor" {
  const value = (role ?? "").trim().toLowerCase();
  if (value === "family") return "Family";
  if (value === "friend" || value === "friends") return "Friend";
  if (value === "visitor" || value === "visitors") return "Visitor";
  return "Contractor";
}

function notifyPerson(contractor: ContractorRow | undefined) {
  return {
    type: normalizeNotifyType(contractor?.role),
    name: contractor?.name ?? "Unknown",
  };
}

/**
 * Ingest a gate event: insert into gate_events, update sessions, emit SSE.
 * Caller must have already matched plate → contractor (active only).
 * Returns inserted event id. Runs inside a single SQLite transaction.
 */
export function ingestEvent(args: {
  contractorId: number;
  plateRaw: string;
  eventType: "enter" | "exit";
  occurredAt: string;
  source?: string;
  ingestKey?: string | null;
  contractor?: ContractorRow;
}): { eventId: number; emits: BusEvent[] } {
  const db = getDb();

  // Load contractor for access-control check if not provided
  const contractor =
    args.contractor ??
    (db
      .prepare("SELECT * FROM contractors WHERE id = ?")
      .get(args.contractorId) as ContractorRow | undefined);

  const emits: BusEvent[] = [];
  const notifQueue: Array<() => Promise<void>> = [];

  const run = db.transaction(() => {
    const insertEvent = db
      .prepare(
        `INSERT INTO gate_events (contractor_id, plate_raw, event_type, occurred_at, source, ingest_key)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        args.contractorId,
        args.plateRaw,
        args.eventType,
        args.occurredAt,
        args.source ?? null,
        args.ingestKey ?? null
      );
    const eventId = Number(insertEvent.lastInsertRowid);

    const openSession = db
      .prepare(
        `SELECT * FROM sessions
         WHERE contractor_id = ? AND status = 'open'
         ORDER BY started_at DESC LIMIT 1`
      )
      .get(args.contractorId) as SessionRow | undefined;

    if (args.eventType === "enter") {
      if (openSession) {
        // Anomaly: previous session had no exit. Flag it.
        db.prepare(
          `UPDATE sessions SET status = 'flagged',
             notes = COALESCE(notes || ' | ', '') || 'double-enter without exit'
           WHERE id = ?`
        ).run(openSession.id);
        emits.push({
          name: "session.flagged",
          data: {
            sessionId: openSession.id,
            contractorId: args.contractorId,
            reason: "double-enter without exit",
          },
        });
        auditLog({
          level: "debug",
          category: "review",
          action: "review.session_flagged",
          message: `Session ${openSession.id} flagged for review: double-enter without exit.`,
          contractorId: args.contractorId,
          plate: args.plateRaw,
          details: { reason: "double-enter without exit" },
        });
      }

      // Access control check
      let accessNote: string | null = null;
      if (contractor) {
        accessNote = checkAccessControl(
          args.occurredAt,
          contractor.allowed_hours,
          contractor.allowed_days
        );
      }

      const initialStatus = accessNote ? "flagged" : "open";
      const ins = db
        .prepare(
          `INSERT INTO sessions (contractor_id, enter_event_id, started_at, status, notes)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          args.contractorId,
          eventId,
          args.occurredAt,
          initialStatus,
          accessNote
        );
      const sessionId = Number(ins.lastInsertRowid);

      if (accessNote) {
        emits.push({
          name: "session.flagged",
          data: {
            sessionId,
            contractorId: args.contractorId,
            reason: accessNote,
          },
        });
        auditLog({
          level: "debug",
          category: "review",
          action: "review.session_flagged",
          message: `Session ${sessionId} flagged for review: ${accessNote}.`,
          contractorId: args.contractorId,
          plate: args.plateRaw,
          details: { reason: accessNote },
        });
        notifQueue.push(() =>
          maybeNotify("unauthorized", {
            body: `[${notifyPerson(contractor).type}] ${notifyPerson(contractor).name} (${args.plateRaw}) entered outside allowed time: ${accessNote}`,
            type: "warning",
          })
        );
      } else {
        emits.push({
          name: "session.opened",
          data: {
            sessionId,
            contractorId: args.contractorId,
            startedAt: args.occurredAt,
          },
        });
        const previousExit = db
          .prepare(
            `SELECT occurred_at
               FROM gate_events
              WHERE contractor_id = ?
                AND event_type = 'exit'
                AND id < ?
              ORDER BY id DESC
              LIMIT 1`
          )
          .get(args.contractorId, eventId) as { occurred_at: string } | undefined;

        let arrivedBody = `[${notifyPerson(contractor).type}] ${notifyPerson(contractor).name} (${args.plateRaw}) arrived.`;
        if (previousExit) {
          const previousExitMs = parseEventTimestamp(previousExit.occurred_at);
          const currentEntryMs = parseEventTimestamp(args.occurredAt);
          const offsiteSeconds = Math.round((currentEntryMs - previousExitMs) / 1000);
          if (
            Number.isFinite(previousExitMs) &&
            Number.isFinite(currentEntryMs) &&
            offsiteSeconds > 0
          ) {
            arrivedBody = `[${notifyPerson(contractor).type}] ${notifyPerson(contractor).name} (${args.plateRaw}) arrived after ${formatExitDuration(offsiteSeconds)} off site.`;
          }
        }

        notifQueue.push(() =>
          maybeNotify("arrived", {
            body: arrivedBody,
            type: "info",
          })
        );
      }
    } else {
      // exit
      if (openSession) {
        const startedMs = Date.parse(openSession.started_at);
        const endedMs = Date.parse(args.occurredAt);
        let duration = Math.round((endedMs - startedMs) / 1000);
        let status: "closed" | "flagged" = "closed";
        let extraNote = "";
        if (!Number.isFinite(duration) || duration < 0) {
          duration = 0;
          status = "flagged";
          extraNote = "negative duration (clock skew?)";
        }
        db.prepare(
          `UPDATE sessions
             SET exit_event_id = ?, ended_at = ?, duration_seconds = ?, status = ?,
                 notes = CASE WHEN ? = '' THEN notes
                              ELSE COALESCE(notes || ' | ', '') || ? END
           WHERE id = ?`
        ).run(
          eventId,
          args.occurredAt,
          duration,
          status,
          extraNote,
          extraNote,
          openSession.id
        );
        if (status === "closed") {
          emits.push({
            name: "session.closed",
            data: {
              sessionId: openSession.id,
              contractorId: args.contractorId,
              startedAt: openSession.started_at,
              endedAt: args.occurredAt,
              durationSeconds: duration,
            },
          });
          notifQueue.push(() =>
            maybeNotify("exited", {
              body: `[${notifyPerson(contractor).type}] ${notifyPerson(contractor).name} (${args.plateRaw}) exited after ${formatExitDuration(duration)}.`,
              type: "info",
            })
          );
        } else {
          emits.push({
            name: "session.flagged",
            data: {
              sessionId: openSession.id,
              contractorId: args.contractorId,
              reason: extraNote,
            },
          });
          auditLog({
            level: "debug",
            category: "review",
            action: "review.session_flagged",
            message: `Session ${openSession.id} flagged for review: ${extraNote}.`,
            contractorId: args.contractorId,
            plate: args.plateRaw,
            details: { reason: extraNote },
          });
          notifQueue.push(() =>
            maybeNotify("flagged", {
              body: `[${notifyPerson(contractor).type}] ${notifyPerson(contractor).name} (${args.plateRaw}): ${extraNote}`,
              type: "failure",
            })
          );
        }
      } else {
        // exit with no open session → zero-length flagged session
        const ins = db
          .prepare(
            `INSERT INTO sessions
               (contractor_id, enter_event_id, exit_event_id, started_at, ended_at,
                duration_seconds, status, notes)
             VALUES (?, ?, ?, ?, ?, 0, 'flagged', 'exit without enter')`
          )
          .run(
            args.contractorId,
            eventId,
            eventId,
            args.occurredAt,
            args.occurredAt
          );
        emits.push({
          name: "session.flagged",
          data: {
            sessionId: Number(ins.lastInsertRowid),
            contractorId: args.contractorId,
            reason: "exit without enter",
          },
        });
        auditLog({
          level: "debug",
          category: "review",
          action: "review.session_flagged",
          message: `Session ${Number(ins.lastInsertRowid)} flagged for review: exit without enter.`,
          contractorId: args.contractorId,
          plate: args.plateRaw,
          details: { reason: "exit without enter" },
        });
        notifQueue.push(() =>
          maybeNotify("flagged", {
            body: `[${notifyPerson(contractor).type}] ${notifyPerson(contractor).name} (${args.plateRaw}): exit without enter.`,
            type: "failure",
          })
        );
      }
    }

    return eventId;
  });

  const eventId = run();

  // Emit outside the DB transaction so listeners see committed state.
  for (const e of emits) {
    emit(e.name, e.data);
  }

  // Fire notifications asynchronously (best-effort)
  for (const fn of notifQueue) {
    fn().catch(() => {});
  }

  return { eventId, emits };
}

/** Look up an active contractor by normalised plate. */
export function findActiveContractorByPlate(
  platteNormalised: string
): ContractorRow | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM contractors WHERE vehicle_reg = ? AND active = 1 LIMIT 1`
    )
    .get(platteNormalised) as ContractorRow | undefined;
}

/** Manually force-close a specific open session by creating an exit event. */
export function forceExitOpenSession(sessionId: number) {
  const db = getDb();
  const target = db
    .prepare(
      `SELECT s.id, s.contractor_id, c.vehicle_reg
         FROM sessions s
         JOIN contractors c ON c.id = s.contractor_id
        WHERE s.id = ? AND s.status = 'open'
        LIMIT 1`
    )
    .get(sessionId) as
    | { id: number; contractor_id: number; vehicle_reg: string }
    | undefined;

  if (!target) {
    throw new Error("Open session not found");
  }

  const latestOpen = db
    .prepare(
      `SELECT id
         FROM sessions
        WHERE contractor_id = ? AND status = 'open'
        ORDER BY started_at DESC
        LIMIT 1`
    )
    .get(target.contractor_id) as { id: number } | undefined;

  if (!latestOpen || latestOpen.id !== sessionId) {
    throw new Error("Session is no longer the active open session");
  }

  const occurredAt = new Date().toISOString();
  const result = ingestEvent({
    contractorId: target.contractor_id,
    plateRaw: target.vehicle_reg,
    eventType: "exit",
    occurredAt,
    source: "manual-force-exit",
  });

  return {
    sessionId,
    eventId: result.eventId,
    occurredAt,
  };
}

// Helper: load settings and fire notification if the toggle is on
async function maybeNotify(
  key: "arrived" | "exited" | "unauthorized" | "flagged",
  opts: { body: string; type: "info" | "warning" | "failure" | "success" }
) {
  try {
    const settings = getSettings();
    if (!settings.apprise_url) return;
    const fieldMap = {
      arrived: settings.notif_arrived,
      exited: settings.notif_exited,
      unauthorized: settings.notif_unauthorized,
      flagged: settings.notif_flagged,
    } as const;
    if (!fieldMap[key]) return;
    await sendNotification({
      appriseUrl: settings.apprise_url,
      title: "Access Control",
      body: opts.body,
      type: opts.type,
    });
  } catch {
    // never throw from notification code
  }
}
