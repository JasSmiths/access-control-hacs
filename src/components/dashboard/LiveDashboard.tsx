"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { ExpandModal } from "@/components/ui/ExpandModal";
import { Button } from "@/components/ui/Button";
import { Users, Clock, LogIn, AlertTriangle } from "lucide-react";
import { formatDateTime, formatDuration } from "@/lib/format";
import { useRetryingEventSource } from "@/lib/useRetryingEventSource";

export type DashboardData = {
  contractors: number;
  openSessions: Array<{
    id: number;
    contractor_id: number;
    contractor_name: string;
    contractor_role: string | null;
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
    event_type: "enter" | "exit";
    occurred_at: string;
    source?: string | null;
    next_enter_at?: string | null;
    previous_exit_at?: string | null;
    previous_enter_at?: string | null;
  }>;
};

type RecentEvent = DashboardData["recent"][number];
type OpenSession = DashboardData["openSessions"][number];
type ClickOrigin = { x: number; y: number };
const STREAM_EVENTS = ["session.opened", "session.closed", "session.flagged", "contractor.updated"];

export function LiveDashboard({ initial }: { initial: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initial);
  const [connected, setConnected] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<RecentEvent | null>(null);
  const [eventOrigin, setEventOrigin] = useState<ClickOrigin | null>(null);
  const [selectedOpenSession, setSelectedOpenSession] = useState<OpenSession | null>(null);
  const [openSessionOrigin, setOpenSessionOrigin] = useState<ClickOrigin | null>(null);
  const [forceExitState, setForceExitState] = useState<"idle" | "saving" | "err">("idle");
  const [forceExitError, setForceExitError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/dashboard", { cache: "no-store" });
      if (r.ok) {
        const next = (await r.json()) as DashboardData;
        setData(next);
      }
    } catch {
      // ignore
    }
  }, []);

  const probeLatency = useCallback(async () => {
    const started = performance.now();
    try {
      const res = await fetch(`/api/health?t=${Date.now()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("health check failed");
      const elapsed = Math.max(1, Math.round(performance.now() - started));
      setLatencyMs(elapsed);
    } catch {
      setLatencyMs(null);
    }
  }, []);

  useRetryingEventSource({
    url: "/api/events/stream",
    eventNames: STREAM_EVENTS,
    onEvent: refresh,
    onConnectionChange: setConnected,
    retryMs: 10_000,
  });

  useEffect(() => {
    void probeLatency();
    const id = window.setInterval(() => {
      void probeLatency();
    }, 15000);
    return () => window.clearInterval(id);
  }, [probeLatency]);

  async function forceExit(session: OpenSession) {
    const ok = window.confirm(
      `Force exit ${session.contractor_name}? This will close the session immediately.`
    );
    if (!ok) return;

    setForceExitState("saving");
    setForceExitError(null);
    try {
      const res = await fetch(`/api/sessions/${session.id}/force-exit`, {
        method: "POST",
      });
      if (!res.ok) {
        setForceExitState("err");
        setForceExitError((await res.text()) || "Force exit failed.");
        return;
      }
      await refresh();
      setSelectedOpenSession(null);
      setOpenSessionOrigin(null);
      setForceExitState("idle");
    } catch {
      setForceExitState("err");
      setForceExitError("Request failed.");
    }
  }

  function closeOpenSessionSheet() {
    setSelectedOpenSession(null);
    setOpenSessionOrigin(null);
    setForceExitState("idle");
    setForceExitError(null);
  }

  const openSessionsPreview = data.openSessions.slice(0, 7);
  const recentPreview = data.recent.slice(0, 7);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-[var(--fg-muted)]">Overview of Activity</p>
        </div>
        <Badge tone={connected ? "success" : "neutral"}>
          {connected
            ? latencyMs === null
              ? "Live"
              : `Live - ${latencyMs}ms`
            : "Offline"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Vehicles tile → /vehicles */}
        <Link href="/vehicles" className="block">
          <StatCard
            label="Vehicles"
            value={data.contractors}
            Icon={Users}
            hint="Active in the system"
            className="hover:ring-2 hover:ring-[var(--accent)] transition-all cursor-pointer"
          />
        </Link>

        <StatCard
          label="On site now"
          value={data.openSessions.length}
          Icon={LogIn}
          className={
            data.openSessions.length > 0
              ? "bg-[var(--success)]/[0.08] border-[var(--success)]/30"
              : undefined
          }
          hint={
            data.openSessions.length === 1
              ? "1 open session"
              : `${data.openSessions.length} open sessions`
          }
        />

        <StatCard
          label="Hours today"
          value={(data.todaysHoursSeconds / 3600).toFixed(2)}
          Icon={Clock}
          hint={`${data.todaysSessionCount} session${data.todaysSessionCount === 1 ? "" : "s"}`}
        />

        {/* Flagged Today tile → /review */}
        <Link href="/review" className="block">
          <StatCard
            label="Flagged today"
            value={data.flaggedToday}
            Icon={AlertTriangle}
            hint={data.flaggedToday === 0 ? "All clean" : "Needs review"}
            className="hover:ring-2 hover:ring-[var(--warning)] transition-all cursor-pointer"
          />
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Currently on site</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            {data.openSessions.length === 0 ? (
              <div className="p-6 text-sm text-[var(--fg-muted)]">
                Nobody currently on site.
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>Type</TH>
                    <TH>Arrival</TH>
                    <TH className="text-right pr-4">Elapsed</TH>
                  </TR>
                </THead>
                <tbody>
                  {openSessionsPreview.map((s) => (
                    <TR
                      key={s.id}
                      onClick={(e) => {
                        setSelectedOpenSession(s);
                        setOpenSessionOrigin({ x: e.clientX, y: e.clientY });
                        setForceExitState("idle");
                        setForceExitError(null);
                      }}
                      className="cursor-pointer"
                    >
                      <TD className="font-medium">{s.contractor_name}</TD>
                      <TD>
                        <Badge tone={typeBadgeTone(s.contractor_role)}>
                          {normalizePersonType(s.contractor_role)}
                        </Badge>
                      </TD>
                      <TD className="text-[var(--fg-muted)]">
                        {formatDateTime(s.started_at)}
                      </TD>
                      <TD className="text-right pr-4 tabular-nums">
                        <Elapsed from={s.started_at} />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
            {data.openSessions.length > 7 ? (
              <div className="px-4 py-2 text-xs text-[var(--fg-muted)] border-t">
                Showing 7 of {data.openSessions.length} on-site sessions.
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent events</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            {data.recent.length === 0 ? (
              <div className="p-6 text-sm text-[var(--fg-muted)]">
                No events yet.
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>Event</TH>
                    <TH>After</TH>
                    <TH>Time</TH>
                  </TR>
                </THead>
                <tbody>
                  {recentPreview.map((e) => (
                    <TR
                      key={e.id}
                      onClick={(evt) => {
                        setSelectedEvent(e);
                        setEventOrigin({ x: evt.clientX, y: evt.clientY });
                      }}
                      className="cursor-pointer"
                    >
                      <TD className="font-medium">{e.contractor_name}</TD>
                      <TD>
                        <Badge
                          tone={e.event_type === "enter" ? "accent" : "neutral"}
                        >
                          {e.event_type}
                        </Badge>
                      </TD>
                      <TD className="tabular-nums text-[var(--fg-muted)]">
                        {formatRecentEventFor(e)}
                      </TD>
                      <TD className="text-[var(--fg-muted)]">
                        {formatDateTime(e.occurred_at)}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
            {data.recent.length > 7 ? (
              <div className="px-4 py-2 text-xs text-[var(--fg-muted)] border-t">
                Showing 7 of {data.recent.length} recent events.
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>

      {/* Event detail modal */}
      <ExpandModal
        open={selectedEvent !== null}
        onClose={() => {
          setSelectedEvent(null);
          setEventOrigin(null);
        }}
        origin={eventOrigin}
        title="Event detail"
      >
        {selectedEvent && <EventDetail event={selectedEvent} />}
      </ExpandModal>

      {/* On-site session detail sheet */}
      <ExpandModal
        open={selectedOpenSession !== null}
        onClose={closeOpenSessionSheet}
        origin={openSessionOrigin}
        title="On-site session"
      >
        {selectedOpenSession && (
          <OnSiteSessionDetail
            session={selectedOpenSession}
            forceExitState={forceExitState}
            forceExitError={forceExitError}
            onForceExit={forceExit}
          />
        )}
      </ExpandModal>
    </div>
  );
}

function EventDetail({ event }: { event: RecentEvent }) {
  const personType = normalizePersonType(event.contractor_role);

  return (
    <dl className="space-y-4 text-sm">
      <DetailRow label="Vehicle">
        <Link
          href={`/vehicles/${event.contractor_id}`}
          className="text-[var(--accent)] hover:underline"
        >
          {event.contractor_name}
        </Link>
      </DetailRow>
      <DetailRow label="Type">
        <Badge tone={typeBadgeTone(event.contractor_role)}>{personType}</Badge>
      </DetailRow>
      <DetailRow label="Event type">
        <Badge tone={event.event_type === "enter" ? "accent" : "neutral"}>
          {event.event_type}
        </Badge>
      </DetailRow>
      <DetailRow label="When">{formatDateTime(event.occurred_at)}</DetailRow>
      {event.event_type === "enter" &&
      personType === "Family" &&
      event.previous_exit_at ? (
        <>
          <DetailRow label="Off site for">
            <span className="font-semibold tabular-nums text-base text-[var(--fg)]">
              {formatElapsedForDashboard(
                Math.max(
                  0,
                  Math.round(
                    (Date.parse(event.occurred_at) - Date.parse(event.previous_exit_at)) / 1000
                  )
                )
              )}
            </span>
          </DetailRow>
          <DetailRow label="Last on site">
            {formatDateTime(event.previous_exit_at)}
          </DetailRow>
        </>
      ) : null}
      {event.event_type === "exit" && personType === "Family" ? (
        <DetailRow label="Off site for">
          {event.next_enter_at ? (
            <span className="font-semibold tabular-nums text-base text-[var(--fg)]">
              {formatElapsedForDashboard(
                Math.max(
                  0,
                  Math.round(
                    (Date.parse(event.next_enter_at) - Date.parse(event.occurred_at)) / 1000
                  )
                )
              )}
            </span>
          ) : (
            <span className="font-semibold tabular-nums text-base text-[var(--fg)]">
              <Elapsed from={event.occurred_at} />
            </span>
          )}
        </DetailRow>
      ) : null}
      {event.source ? <DetailRow label="Source">{event.source}</DetailRow> : null}
      <DetailRow label="Event ID">
        <span className="font-mono text-xs text-[var(--fg-muted)]">#{event.id}</span>
      </DetailRow>
    </dl>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <dt className="w-28 shrink-0 font-medium text-[var(--fg-muted)]">{label}</dt>
      <dd className="text-[var(--fg)]">{children}</dd>
    </div>
  );
}

function Elapsed({ from }: { from: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.round((now - Date.parse(from)) / 1000));
  return <>{formatElapsedForDashboard(seconds)}</>;
}

function formatElapsedForDashboard(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  return formatDuration(s);
}

function formatRecentEventFor(event: RecentEvent): string {
  const previous =
    event.event_type === "enter" ? event.previous_exit_at : event.previous_enter_at;
  if (!previous) return "-";

  const seconds = Math.max(
    0,
    Math.round((Date.parse(event.occurred_at) - Date.parse(previous)) / 1000)
  );
  return formatElapsedForDashboard(seconds);
}

function normalizePersonType(
  role: string | null | undefined
): "Family" | "Friends" | "Visitors" | "Contractors" {
  const value = (role ?? "").trim().toLowerCase();
  if (value === "family") return "Family";
  if (value === "friend" || value === "friends") return "Friends";
  if (value === "visitor" || value === "visitors") return "Visitors";
  if (value === "contractor" || value === "contractors") return "Contractors";
  return "Contractors";
}

function typeBadgeTone(role: string | null | undefined): "accent" | "neutral" | "warning" {
  const type = normalizePersonType(role);
  if (type === "Family") return "accent";
  if (type === "Visitors") return "warning";
  return "neutral";
}

function OnSiteSessionDetail({
  session,
  onForceExit,
  forceExitState,
  forceExitError,
}: {
  session: OpenSession;
  onForceExit: (session: OpenSession) => Promise<void>;
  forceExitState: "idle" | "saving" | "err";
  forceExitError: string | null;
}) {
  return (
    <div className="space-y-5">
      <dl className="space-y-4 text-sm">
        <DetailRow label="Vehicle">
          <Link
            href={`/vehicles/${session.contractor_id}`}
            className="text-[var(--accent)] hover:underline"
          >
            {session.contractor_name}
          </Link>
        </DetailRow>
        <DetailRow label="Session ID">
          <span className="font-mono text-xs text-[var(--fg-muted)]">#{session.id}</span>
        </DetailRow>
        <DetailRow label="Entered">{formatDateTime(session.started_at)}</DetailRow>
        <DetailRow label="Time on site">
          <span className="font-semibold tabular-nums text-base text-[var(--fg)]">
            <Elapsed from={session.started_at} />
          </span>
        </DetailRow>
      </dl>

      {forceExitError ? (
        <div className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {forceExitError}
        </div>
      ) : null}

      <Button
        type="button"
        variant="danger"
        className="w-full"
        disabled={forceExitState === "saving"}
        onClick={() => onForceExit(session)}
      >
        {forceExitState === "saving" ? "Forcing exit…" : "Force Exit"}
      </Button>
    </div>
  );
}
