"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ExpandModal } from "@/components/ui/ExpandModal";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import type { EventRow, EventsPageData, SessionListRow } from "@/lib/events-page";
import { formatDateTime, formatDuration } from "@/lib/format";
import { useRetryingEventSource } from "@/lib/useRetryingEventSource";

const PAGE_SIZE = 10;
const STREAM_EVENTS = ["session.opened", "session.closed", "session.flagged", "contractor.updated"];

function formatSource(source: string | null | undefined) {
  const raw = (source ?? "").trim();
  if (!raw) return { channel: "Webhook", detail: "default" };
  const lower = raw.toLowerCase();
  if (lower === "simulate") return { channel: "UI", detail: "simulate panel" };
  if (lower === "manual-force-exit") return { channel: "UI", detail: "force exit" };
  if (lower.startsWith("api")) return { channel: "API", detail: raw };
  return { channel: "Webhook", detail: raw };
}

function normalizePersonType(
  role: string | null | undefined
): "Family" | "Friends" | "Visitors" | "Contractors" {
  const value = (role ?? "").trim().toLowerCase();
  if (value === "family") return "Family";
  if (value === "friend" || value === "friends") return "Friends";
  if (value === "visitor" || value === "visitors") return "Visitors";
  return "Contractors";
}

function typeBadgeTone(role: string | null | undefined): "accent" | "neutral" | "warning" {
  const type = normalizePersonType(role);
  if (type === "Family") return "accent";
  if (type === "Visitors") return "warning";
  return "neutral";
}

function formatElapsedWithDays(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  return formatDuration(s);
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <dt className="w-28 shrink-0 font-medium text-[var(--fg-muted)]">{label}</dt>
      <dd className="text-[var(--fg)]">{children}</dd>
    </div>
  );
}

function ElapsedFrom({ from }: { from: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.round((now - Date.parse(from)) / 1000));
  return <>{formatElapsedWithDays(seconds)}</>;
}

function EventDetail({ event }: { event: EventRow }) {
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
              {formatElapsedWithDays(
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
              {formatElapsedWithDays(
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
              <ElapsedFrom from={event.occurred_at} />
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

function SessionDetail({ session }: { session: SessionListRow }) {
  return (
    <dl className="space-y-4 text-sm">
      <DetailRow label="Vehicle">
        <Link
          href={`/vehicles/${session.contractor_id}`}
          className="text-[var(--accent)] hover:underline"
        >
          {session.contractor_name}
        </Link>
      </DetailRow>
      <DetailRow label="Type">
        <Badge tone={typeBadgeTone(session.contractor_role)}>
          {normalizePersonType(session.contractor_role)}
        </Badge>
      </DetailRow>
      <DetailRow label="Started">{formatDateTime(session.started_at)}</DetailRow>
      <DetailRow label="Ended">
        {session.ended_at ? formatDateTime(session.ended_at) : "—"}
      </DetailRow>
      <DetailRow label="Duration">
        {session.ended_at ? formatElapsedWithDays(session.duration_seconds ?? 0) : <ElapsedFrom from={session.started_at} />}
      </DetailRow>
      <DetailRow label="Status">
        <Badge
          tone={
            session.status === "closed"
              ? "success"
              : session.status === "open"
                ? "accent"
                : "warning"
          }
        >
          {session.status}
        </Badge>
      </DetailRow>
      <DetailRow label="Notes">{session.notes ?? "—"}</DetailRow>
      <DetailRow label="Session ID">
        <span className="font-mono text-xs text-[var(--fg-muted)]">#{session.id}</span>
      </DetailRow>
    </dl>
  );
}

function Pagination({
  page,
  total,
  onChange,
  count,
}: {
  page: number;
  total: number;
  onChange: (next: number) => void;
  count: number;
}) {
  if (total <= 1) return null;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, count);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t">
      <div className="text-xs text-[var(--fg-muted)]">
        Showing {start}-{end} of {count}
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="cursor-pointer hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </Button>
        <span className="text-xs text-[var(--fg-muted)]">
          Page {page} of {total}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="cursor-pointer hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]"
          onClick={() => onChange(page + 1)}
          disabled={page >= total}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export function LiveEvents({ initial }: { initial: EventsPageData }) {
  const [data, setData] = useState<EventsPageData>(initial);
  const [connected, setConnected] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [showClosedSessions, setShowClosedSessions] = useState(false);
  const [eventsPage, setEventsPage] = useState(1);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionListRow | null>(null);
  const [eventOrigin, setEventOrigin] = useState<{ x: number; y: number } | null>(null);
  const [sessionOrigin, setSessionOrigin] = useState<{ x: number; y: number } | null>(null);

  const filteredSessions = useMemo(() => {
    if (!showClosedSessions) return data.sessions.filter((s) => s.status === "open");
    return data.sessions.filter((s) => s.status === "open" || s.status === "closed");
  }, [data.sessions, showClosedSessions]);

  const eventsTotalPages = Math.max(1, Math.ceil(data.events.length / PAGE_SIZE));
  const sessionsTotalPages = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE));

  useEffect(() => {
    if (eventsPage > eventsTotalPages) setEventsPage(eventsTotalPages);
  }, [eventsPage, eventsTotalPages]);

  useEffect(() => {
    if (sessionsPage > sessionsTotalPages) setSessionsPage(sessionsTotalPages);
  }, [sessionsPage, sessionsTotalPages]);

  const visibleEvents = useMemo(() => {
    const start = (eventsPage - 1) * PAGE_SIZE;
    return data.events.slice(start, start + PAGE_SIZE);
  }, [data.events, eventsPage]);

  const visibleSessions = useMemo(() => {
    const start = (sessionsPage - 1) * PAGE_SIZE;
    return filteredSessions.slice(start, start + PAGE_SIZE);
  }, [filteredSessions, sessionsPage]);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/events/live?limit=100", { cache: "no-store" });
      if (!r.ok) return;
      const next = (await r.json()) as EventsPageData;
      setData(next);
    } catch {
      // ignore
    }
  }, []);

  const probeLatency = useCallback(async () => {
    const started = performance.now();
    try {
      const res = await fetch(`/api/health?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("health check failed");
      setLatencyMs(Math.max(1, Math.round(performance.now() - started)));
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
    const id = window.setInterval(() => void probeLatency(), 15000);
    return () => window.clearInterval(id);
  }, [probeLatency]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Raw gate events and derived sessions. Showing 10 rows per page.
          </p>
        </div>
        <Badge tone={connected ? "success" : "neutral"}>
          {connected
            ? latencyMs == null
              ? "Live"
              : `Live - ${latencyMs}ms`
            : "Offline"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>Sessions</CardTitle>
            <label className="inline-flex items-center gap-2 text-xs text-[var(--fg-muted)]">
              <input
                type="checkbox"
                checked={showClosedSessions}
                onChange={(e) => {
                  setShowClosedSessions(e.target.checked);
                  setSessionsPage(1);
                }}
              />
              Show closed sessions
            </label>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {filteredSessions.length === 0 ? (
            <div className="p-6 text-sm text-[var(--fg-muted)]">
              {showClosedSessions
                ? "No open or closed sessions yet."
                : "No open sessions right now."}
            </div>
          ) : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Vehicle</TH>
                    <TH>Started</TH>
                    <TH>Ended</TH>
                    <TH>Duration</TH>
                    <TH>Status</TH>
                    <TH>Notes</TH>
                  </TR>
                </THead>
                <tbody>
                  {visibleSessions.map((s) => (
                    <TR
                      key={s.id}
                      className="cursor-pointer"
                      onClick={(e) => {
                        setSelectedSession(s);
                        setSessionOrigin({ x: e.clientX, y: e.clientY });
                      }}
                    >
                      <TD className="font-medium">{s.contractor_name}</TD>
                      <TD>{formatDateTime(s.started_at)}</TD>
                      <TD>{s.ended_at ? formatDateTime(s.ended_at) : "—"}</TD>
                      <TD>
                        {s.ended_at ? (
                          formatElapsedWithDays(s.duration_seconds ?? 0)
                        ) : (
                          <ElapsedFrom from={s.started_at} />
                        )}
                      </TD>
                      <TD>
                        <Badge
                          tone={
                            s.status === "closed"
                              ? "success"
                              : s.status === "open"
                                ? "accent"
                                : "warning"
                          }
                        >
                          {s.status}
                        </Badge>
                      </TD>
                      <TD className="text-[var(--fg-muted)]">{s.notes ?? "—"}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
              <Pagination
                page={sessionsPage}
                total={sessionsTotalPages}
                onChange={setSessionsPage}
                count={filteredSessions.length}
              />
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gate events</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {data.events.length === 0 ? (
            <div className="p-6 text-sm text-[var(--fg-muted)]">No events yet.</div>
          ) : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Vehicle</TH>
                    <TH>Event</TH>
                    <TH>When</TH>
                    <TH>Source</TH>
                  </TR>
                </THead>
                <tbody>
                  {visibleEvents.map((e) => {
                    const source = formatSource(e.source);
                    return (
                      <TR
                        key={e.id}
                        className="cursor-pointer"
                        onClick={(evt) => {
                          setSelectedEvent(e);
                          setEventOrigin({ x: evt.clientX, y: evt.clientY });
                        }}
                      >
                        <TD className="font-medium">{e.contractor_name}</TD>
                        <TD>
                          <Badge tone={e.event_type === "enter" ? "accent" : "neutral"}>
                            {e.event_type}
                          </Badge>
                        </TD>
                        <TD>{formatDateTime(e.occurred_at)}</TD>
                        <TD className="text-[var(--fg-muted)]">
                          <span className="font-medium text-[var(--fg)]">
                            {source.channel}
                          </span>
                          <span className="text-xs">{" · "}{source.detail}</span>
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
              <Pagination
                page={eventsPage}
                total={eventsTotalPages}
                onChange={setEventsPage}
                count={data.events.length}
              />
            </>
          )}
        </CardBody>
      </Card>

      <ExpandModal
        open={selectedEvent !== null}
        onClose={() => {
          setSelectedEvent(null);
          setEventOrigin(null);
        }}
        origin={eventOrigin}
        title="Event detail"
      >
        {selectedEvent ? <EventDetail event={selectedEvent} /> : null}
      </ExpandModal>

      <ExpandModal
        open={selectedSession !== null}
        onClose={() => {
          setSelectedSession(null);
          setSessionOrigin(null);
        }}
        origin={sessionOrigin}
        title="Session detail"
      >
        {selectedSession ? <SessionDetail session={selectedSession} /> : null}
      </ExpandModal>
    </div>
  );
}
