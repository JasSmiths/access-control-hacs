import "server-only";
import { getDb } from "./db";

export type DashboardData = {
  contractors: number;
  people: Array<{
    contractor_id: number;
    contractor_name: string;
    contractor_role: string | null;
    vehicle_reg: string;
    on_site: boolean;
    last_event_type: "enter" | "exit" | null;
    last_event_at: string | null;
  }>;
  openSessions: Array<{
    id: number;
    contractor_id: number;
    contractor_name: string;
    contractor_role: string | null;
    vehicle_reg: string;
    started_at: string;
  }>;
  todaysHoursSeconds: number;
  todaysSessionCount: number;
  flaggedToday: number;
  recent: Array<{
    id: number;
    contractor_id: number;
    contractor_name: string;
    contractor_role: string | null;
    vehicle_reg: string;
    event_type: "enter" | "exit";
    occurred_at: string;
    source?: string | null;
    next_enter_at?: string | null;
    previous_exit_at?: string | null;
    previous_enter_at?: string | null;
  }>;
};

export function loadDashboard(): DashboardData {
  const db = getDb();

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const startISO = todayStart.toISOString();

  const contractors = (
    db.prepare("SELECT COUNT(*) AS n FROM contractors WHERE active = 1").get() as {
      n: number;
    }
  ).n;

  const openSessions = db
    .prepare(
      `SELECT s.id, s.contractor_id, c.name AS contractor_name, c.role AS contractor_role, s.started_at
              , c.vehicle_reg
         FROM sessions s
         JOIN contractors c ON c.id = s.contractor_id
        WHERE s.status = 'open'
        ORDER BY s.started_at DESC`
    )
    .all() as DashboardData["openSessions"];

  const people = db
    .prepare(
      `SELECT c.id AS contractor_id,
              c.name AS contractor_name,
              c.role AS contractor_role,
              c.vehicle_reg AS vehicle_reg,
              CASE
                WHEN EXISTS (
                  SELECT 1
                    FROM sessions s
                   WHERE s.contractor_id = c.id
                     AND s.status = 'open'
                ) THEN 1
                ELSE 0
              END AS on_site,
              (
                SELECT e.event_type
                  FROM gate_events e
                 WHERE e.contractor_id = c.id
                 ORDER BY e.occurred_at DESC
                 LIMIT 1
              ) AS last_event_type,
              (
                SELECT e.occurred_at
                  FROM gate_events e
                 WHERE e.contractor_id = c.id
                 ORDER BY e.occurred_at DESC
                 LIMIT 1
              ) AS last_event_at
         FROM contractors c
        WHERE c.active = 1
        ORDER BY c.name ASC`
    )
    .all()
    .map((row) => ({
      contractor_id: Number((row as { contractor_id: number }).contractor_id),
      contractor_name: (row as { contractor_name: string }).contractor_name,
      contractor_role: (row as { contractor_role: string | null }).contractor_role,
      vehicle_reg: (row as { vehicle_reg: string }).vehicle_reg,
      on_site: Boolean((row as { on_site: number }).on_site),
      last_event_type: (row as { last_event_type: "enter" | "exit" | null }).last_event_type,
      last_event_at: (row as { last_event_at: string | null }).last_event_at,
    })) as DashboardData["people"];

  const todayStats = db
    .prepare(
      `SELECT COALESCE(SUM(duration_seconds), 0) AS total,
              COUNT(*) AS count
         FROM sessions
        WHERE status = 'closed' AND started_at >= ?`
    )
    .get(startISO) as { total: number; count: number };

  const flaggedToday = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM sessions
          WHERE status = 'flagged' AND started_at >= ?`
      )
      .get(startISO) as { n: number }
  ).n;

  const recent = db
    .prepare(
      `SELECT e.id,
              e.contractor_id,
              c.name AS contractor_name,
              c.role AS contractor_role,
              c.vehicle_reg,
              e.event_type,
              e.occurred_at,
              e.source,
              (
                SELECT MIN(e2.occurred_at)
                  FROM gate_events e2
                 WHERE e2.contractor_id = e.contractor_id
                   AND e2.event_type = 'enter'
                   AND e2.occurred_at > e.occurred_at
              ) AS next_enter_at,
              (
                SELECT MAX(e3.occurred_at)
                  FROM gate_events e3
                 WHERE e3.contractor_id = e.contractor_id
                   AND e3.event_type = 'exit'
                   AND e3.occurred_at < e.occurred_at
              ) AS previous_exit_at,
              (
                SELECT MAX(e4.occurred_at)
                  FROM gate_events e4
                 WHERE e4.contractor_id = e.contractor_id
                   AND e4.event_type = 'enter'
                   AND e4.occurred_at < e.occurred_at
              ) AS previous_enter_at
         FROM gate_events e
         JOIN contractors c ON c.id = e.contractor_id
        ORDER BY e.occurred_at DESC
        LIMIT 10`
    )
    .all() as DashboardData["recent"];

  return {
    contractors,
    people,
    openSessions,
    todaysHoursSeconds: Number(todayStats.total ?? 0),
    todaysSessionCount: Number(todayStats.count ?? 0),
    flaggedToday,
    recent,
  };
}
