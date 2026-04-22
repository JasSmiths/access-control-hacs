"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ExpandModal } from "@/components/ui/ExpandModal";
import { Field, Input } from "@/components/ui/Input";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { formatDateTime } from "@/lib/format";
import type {
  ActiveApiStream,
  LogRow,
  LogsPageData,
} from "@/lib/shared-types";
import { useRetryingEventSource } from "@/lib/useRetryingEventSource";

type DetailItem = {
  label: string;
  value: string;
};

type FieldChangeItem = {
  field: string;
  before: unknown;
  after: unknown;
};

type ParsedDetails =
  | { kind: "empty" }
  | { kind: "changes"; items: FieldChangeItem[] }
  | { kind: "event_meta"; rows: Array<{ eventId: string; type: string; source: string }> }
  | { kind: "items"; items: DetailItem[] }
  | { kind: "raw"; raw: string };

type WebhookCapture = {
  capturedAtLogLevel: string;
  payload: unknown;
};
const STREAM_EVENTS = [
  "session.opened",
  "session.closed",
  "session.flagged",
  "contractor.updated",
  "log.created",
];

export function LiveLogs({ initial }: { initial: LogsPageData }) {
  const [data, setData] = useState<LogsPageData>(initial);
  const [connected, setConnected] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [selectedLog, setSelectedLog] = useState<LogRow | null>(null);
  const [editingDevice, setEditingDevice] = useState<{ id: string; current: string } | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "err">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearButtonState, setClearButtonState] = useState<"idle" | "confirm" | "success">("idle");
  const [clearError, setClearError] = useState<string | null>(null);
  const [showFullWebhook, setShowFullWebhook] = useState(false);
  const clearConfirmTimeoutRef = useRef<number | null>(null);
  const clearSuccessTimeoutRef = useRef<number | null>(null);

  const refreshLogs = useCallback(async (page = data.page) => {
    try {
      const r = await fetch(`/api/logs?page=${page}&pageSize=${data.pageSize}`, { cache: "no-store" });
      if (!r.ok) return;
      const payload = (await r.json()) as Omit<LogsPageData, "streams">;
      setData((current) => ({ ...current, ...payload }));
    } catch {
      // ignore
    }
  }, [data.page, data.pageSize]);

  const refreshStreams = useCallback(async () => {
    try {
      const r = await fetch("/api/logs/streams", { cache: "no-store" });
      if (!r.ok) return;
      const payload = (await r.json()) as { streams: ActiveApiStream[] };
      setData((current) => ({ ...current, streams: payload.streams }));
    } catch {
      // ignore
    }
  }, []);

  const probeLatency = useCallback(async () => {
    const started = performance.now();
    try {
      const res = await fetch(`/api/health?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("health failed");
      setLatencyMs(Math.max(1, Math.round(performance.now() - started)));
    } catch {
      setLatencyMs(null);
    }
  }, []);

  useRetryingEventSource({
    url: "/api/events/stream",
    eventNames: STREAM_EVENTS,
    onEvent: refreshLogs,
    onConnectionChange: setConnected,
    retryMs: 10_000,
  });

  useEffect(() => {
    void probeLatency();
    void refreshStreams();
    const latencyId = window.setInterval(() => void probeLatency(), 15000);
    const streamsId = window.setInterval(() => void refreshStreams(), 15000);
    return () => {
      window.clearInterval(latencyId);
      window.clearInterval(streamsId);
    };
  }, [probeLatency, refreshStreams]);

  const hasRows = data.rows.length > 0;
  const totalPages = Math.max(1, Math.ceil(data.count / data.pageSize));
  const parsedDetails = useMemo(
    () => parseDetailsJson(selectedLog?.details_json ?? null),
    [selectedLog?.details_json]
  );
  const webhookCapture = useMemo(
    () => extractWebhookCapture(selectedLog?.details_json ?? null),
    [selectedLog?.details_json]
  );

  useEffect(() => {
    setShowFullWebhook(false);
  }, [selectedLog?.id]);

  useEffect(() => {
    return () => {
      if (clearConfirmTimeoutRef.current != null) {
        window.clearTimeout(clearConfirmTimeoutRef.current);
      }
      if (clearSuccessTimeoutRef.current != null) {
        window.clearTimeout(clearSuccessTimeoutRef.current);
      }
    };
  }, []);

  function startEditDevice(row: LogRow) {
    if (!row.device_id) return;
    setEditingDevice({ id: row.device_id, current: row.device_name ?? "" });
    setDeviceName(row.device_name ?? "");
    setSaveState("idle");
    setSaveError(null);
  }

  async function saveDeviceName() {
    if (!editingDevice) return;
    setSaveState("saving");
    setSaveError(null);
    try {
      const res = await fetch(`/api/log-devices/${encodeURIComponent(editingDevice.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: deviceName }),
      });
      if (!res.ok) {
        setSaveState("err");
        setSaveError((await res.text()) || "Failed to save");
        return;
      }
      setSaveState("idle");
      setEditingDevice(null);
      await refreshLogs();
    } catch {
      setSaveState("err");
      setSaveError("Request failed");
    }
  }

  async function clearAllLogs() {
    setClearing(true);
    setClearError(null);
    try {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 700));
      const res = await fetch("/api/logs", {
        method: "DELETE",
      });
      if (!res.ok) {
        setClearError((await res.text()) || "Failed to clear logs");
        setClearButtonState("idle");
        setClearing(false);
        return;
      }

      setSelectedLog(null);
      setData((current) => ({
        ...current,
        rows: [],
        count: 0,
        page: 1,
        logSizeBytes: 0,
      }));
      setClearButtonState("success");
      if (clearSuccessTimeoutRef.current != null) {
        window.clearTimeout(clearSuccessTimeoutRef.current);
      }
      clearSuccessTimeoutRef.current = window.setTimeout(() => {
        setClearButtonState("idle");
      }, 2500);
      void refreshLogs(1);
    } catch {
      setClearError("Request failed");
      setClearButtonState("idle");
    } finally {
      setClearing(false);
    }
  }

  function handleClearButtonClick() {
    if (clearing) return;

    setClearError(null);
    if (clearButtonState === "idle") {
      setClearButtonState("confirm");
      if (clearConfirmTimeoutRef.current != null) {
        window.clearTimeout(clearConfirmTimeoutRef.current);
      }
      clearConfirmTimeoutRef.current = window.setTimeout(() => {
        setClearButtonState("idle");
      }, 4000);
      return;
    }

    if (clearButtonState === "confirm") {
      if (clearConfirmTimeoutRef.current != null) {
        window.clearTimeout(clearConfirmTimeoutRef.current);
        clearConfirmTimeoutRef.current = null;
      }
      void clearAllLogs();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Live operational audit log for webhooks, auth, API calls, and session actions.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:gap-3 sm:self-auto">
          <Badge tone={connected ? "success" : "neutral"}>
            {connected
              ? latencyMs == null
                ? "Live"
                : `Live - ${latencyMs}ms`
              : "Offline"}
          </Badge>
        </div>
      </div>

      {clearError ? <p className="text-sm text-[var(--danger)]">{clearError}</p> : null}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Currently Connected API Streams</CardTitle>
            <Badge tone={data.streams.length > 0 ? "accent" : "neutral"}>
              {data.streams.length} active
            </Badge>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {data.streams.length === 0 ? (
            <div className="p-6 text-sm text-[var(--fg-muted)]">No active API streams.</div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Connected</TH>
                  <TH>API Key</TH>
                  <TH>Source IP</TH>
                  <TH>Forwarded Via</TH>
                  <TH>Client</TH>
                </TR>
              </THead>
              <tbody>
                {data.streams.map((stream) => {
                  const forwardedChain = formatForwardedChain(stream);
                  return (
                    <TR key={stream.id}>
                      <TD className="whitespace-nowrap">{formatDateTime(stream.connected_at)}</TD>
                      <TD className="font-mono text-xs">{stream.actor}</TD>
                      <TD>
                        <div className="font-mono text-xs">{stream.ip ?? "—"}</div>
                        <div className="text-xs text-[var(--fg-muted)]">{stream.ip_source ?? "—"}</div>
                      </TD>
                      <TD className="max-w-[18rem] truncate font-mono text-xs" title={forwardedChain}>
                        {forwardedChain}
                      </TD>
                      <TD className="max-w-[18rem] truncate text-xs" title={stream.user_agent ?? stream.path}>
                        {stream.user_agent ?? stream.path}
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Recent activity</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={clearing || clearButtonState === "success" ? "secondary" : "danger"}
                size="sm"
                className="!h-5 !rounded-full !px-2 !text-[11px] !leading-none !transition-none"
                onClick={handleClearButtonClick}
                disabled={clearing}
              >
                <span className="relative -top-px">
                  {clearing
                    ? "Clearing…"
                    : clearButtonState === "confirm"
                      ? "Are you sure?"
                      : clearButtonState === "success"
                        ? "Cleared"
                        : "Clear logs"}
                </span>
              </Button>
              <Badge tone="neutral">{formatBytes(data.logSizeBytes)}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {!hasRows ? (
            <div className="p-6 text-sm text-[var(--fg-muted)]">No logs yet.</div>
          ) : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>When</TH>
                    <TH>Level</TH>
                    <TH>Action</TH>
                    <TH>Message</TH>
                    <TH>Device</TH>
                  </TR>
                </THead>
                <tbody>
                  {data.rows.map((row) => (
                    <TR
                      key={row.id}
                      onClick={() => setSelectedLog(row)}
                      className="cursor-pointer"
                    >
                      <TD className="whitespace-nowrap">{formatDateTime(row.occurred_at)}</TD>
                      <TD>
                        <Badge
                          tone={
                            row.level === "error"
                              ? "danger"
                              : row.level === "debug"
                                ? "accent"
                                : "neutral"
                          }
                        >
                          {row.level}
                        </Badge>
                      </TD>
                      <TD className="font-mono text-xs">{row.action}</TD>
                      <TD className="max-w-[26rem] truncate" title={row.message}>{row.message}</TD>
                      <TD>
                        {row.device_id ? (
                          <button
                            type="button"
                            className="text-left text-xs hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditDevice(row);
                            }}
                          >
                            {row.device_name ? `${row.device_name} (${row.device_id})` : row.device_id}
                          </button>
                        ) : (
                          "—"
                        )}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
              <Pagination
                page={data.page}
                total={totalPages}
                count={data.count}
                pageSize={data.pageSize}
                onChange={(nextPage) => void refreshLogs(nextPage)}
              />
            </>
          )}
        </CardBody>
      </Card>

      <ExpandModal
        open={selectedLog !== null}
        onClose={() => setSelectedLog(null)}
        title="Log Details"
      >
        {selectedLog ? (
          <dl className="space-y-3 text-sm">
            <DetailRow label="When">{formatDateTime(selectedLog.occurred_at)}</DetailRow>
            <DetailRow label="Level">
              <Badge
                tone={
                  selectedLog.level === "error"
                    ? "danger"
                    : selectedLog.level === "debug"
                      ? "accent"
                      : "neutral"
                }
              >
                {selectedLog.level}
              </Badge>
            </DetailRow>
            <DetailRow label="Category">{selectedLog.category}</DetailRow>
            <DetailRow label="Action">
              <span className="font-mono text-xs">{selectedLog.action}</span>
            </DetailRow>
            {isWebhookLog(selectedLog) ? (
              <DetailRow label="Webhook">
                {webhookCapture ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 text-[var(--accent)] hover:bg-transparent hover:underline"
                    onClick={() => setShowFullWebhook((current) => !current)}
                  >
                    {showFullWebhook ? "Hide Full Webhook" : "Show Full Webhook"}
                  </Button>
                ) : (
                  <span className="text-[var(--fg-muted)]">
                    Log Level Wasnt Set to Debug when Ingested.
                  </span>
                )}
              </DetailRow>
            ) : null}
            {isWebhookLog(selectedLog) && webhookCapture && showFullWebhook ? (
              <DetailRow label="Webhook Payload">
                <div className="rounded-lg border bg-[var(--bg)] p-3">
                  <div className="mb-2 text-xs text-[var(--fg-muted)]">
                    Captured when log level was set to{" "}
                    <span className="font-mono">{webhookCapture.capturedAtLogLevel}</span>
                    .
                  </div>
                  <pre className="max-h-[24rem] overflow-auto rounded border bg-[var(--bg-elevated)] p-3 text-xs whitespace-pre-wrap break-all text-[var(--fg)]">
                    {formatWebhookPayload(webhookCapture.payload)}
                  </pre>
                </div>
              </DetailRow>
            ) : null}
            <DetailRow label="Message">{selectedLog.message}</DetailRow>
            <DetailRow label="IP">
              <span className="font-mono text-xs">{selectedLog.ip ?? "—"}</span>
            </DetailRow>
            <DetailRow label="Method">{selectedLog.method ?? "—"}</DetailRow>
            <DetailRow label="Path">
              <span className="font-mono text-xs">{selectedLog.path ?? "—"}</span>
            </DetailRow>
            <DetailRow label="User">{selectedLog.actor ?? "—"}</DetailRow>
            <DetailRow label="Plate">
              <span className="font-mono text-xs">{selectedLog.plate ?? "—"}</span>
            </DetailRow>
            <DetailRow label="Device">
              {selectedLog.device_id ? (
                <button
                  type="button"
                  className="text-left text-xs hover:underline"
                  onClick={() => {
                    setSelectedLog(null);
                    startEditDevice(selectedLog);
                  }}
                >
                  {selectedLog.device_name
                    ? `${selectedLog.device_name} (${selectedLog.device_id})`
                    : selectedLog.device_id}
                </button>
              ) : (
                "—"
              )}
            </DetailRow>
            <DetailRow label="Event ID">
              <span className="font-mono text-xs break-all">{selectedLog.event_id ?? "—"}</span>
            </DetailRow>
            <DetailRow label="Details">
              {parsedDetails.kind === "empty" ? (
                <span className="text-[var(--fg-muted)]">—</span>
              ) : parsedDetails.kind === "changes" ? (
                parsedDetails.items.length === 0 ? (
                  <span className="text-[var(--fg-muted)]">No field values changed.</span>
                ) : (
                  <div className="overflow-hidden rounded-lg border bg-[var(--bg)]">
                    <Table className="text-xs [&>tbody>tr:hover]:bg-transparent">
                      <THead>
                        <TR>
                          <TH>Updated</TH>
                          <TH>Before</TH>
                          <TH>After</TH>
                        </TR>
                      </THead>
                      <tbody>
                        {parsedDetails.items.map((item) => (
                          <TR
                            key={`${item.field}:${stringifyDetailValue(item.before)}:${stringifyDetailValue(item.after)}`}
                          >
                            <TD className="text-[var(--fg-muted)]">
                              {formatDetailLabel(item.field)}
                            </TD>
                            <TD className="font-mono text-[var(--fg)] break-all">
                              {stringifyDetailValue(item.before)}
                            </TD>
                            <TD className="font-mono text-[var(--fg)] break-all">
                              {stringifyDetailValue(item.after)}
                            </TD>
                          </TR>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )
              ) : parsedDetails.kind === "items" ? (
                <div className="overflow-hidden rounded-lg border bg-[var(--bg)]">
                  <Table className="text-xs [&>tbody>tr:hover]:bg-transparent">
                    <THead>
                      <TR>
                        <TH>Updated</TH>
                        <TH>Value</TH>
                      </TR>
                    </THead>
                    <tbody>
                      {parsedDetails.items.map((item) => (
                        <TR key={`${item.label}:${item.value}`}>
                          <TD className="text-[var(--fg-muted)]">{item.label}</TD>
                          <TD className="font-mono text-[var(--fg)] break-all">{item.value}</TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                </div>
              ) : parsedDetails.kind === "event_meta" ? (
                <div className="overflow-hidden rounded-lg border bg-[var(--bg)]">
                  <Table className="text-xs [&>tbody>tr:hover]:bg-transparent">
                    <THead>
                      <TR>
                        <TH>Event ID</TH>
                        <TH>Type</TH>
                        <TH>Source</TH>
                      </TR>
                    </THead>
                    <tbody>
                      {parsedDetails.rows.map((row, index) => (
                        <TR key={`${row.eventId}:${row.type}:${row.source}:${index}`}>
                          <TD className="font-mono text-[var(--fg)] break-all">{row.eventId}</TD>
                          <TD className="font-mono text-[var(--fg)] break-all">{row.type}</TD>
                          <TD className="font-mono text-[var(--fg)] break-all">{row.source}</TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                </div>
              ) : (
                <pre className="rounded-lg border bg-[var(--bg)] p-3 text-xs whitespace-pre-wrap break-all text-[var(--fg-muted)]">
                  {parsedDetails.raw}
                </pre>
              )}
            </DetailRow>
          </dl>
        ) : null}
      </ExpandModal>

      <ExpandModal
        open={editingDevice !== null}
        onClose={() => setEditingDevice(null)}
        title="Name Device"
      >
        {editingDevice ? (
          <div className="space-y-4">
            <Field label="Device ID">
              <Input readOnly value={editingDevice.id} />
            </Field>
            <Field label="Friendly name">
              <Input
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="e.g. Front Gate Camera"
              />
            </Field>
            {saveError ? <p className="text-sm text-[var(--danger)]">{saveError}</p> : null}
            <Button type="button" onClick={saveDeviceName} disabled={saveState === "saving"}>
              {saveState === "saving" ? "Saving…" : "Save name"}
            </Button>
          </div>
        ) : null}
      </ExpandModal>
    </div>
  );
}

function Pagination({
  page,
  total,
  count,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  count: number;
  pageSize: number;
  onChange: (next: number) => void;
}) {
  if (total <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, count);

  return (
    <div className="flex items-center justify-between border-t px-4 py-3">
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

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <dt className="w-24 shrink-0 font-medium text-[var(--fg-muted)]">{label}</dt>
      <dd className="text-[var(--fg)] min-w-0">{children}</dd>
    </div>
  );
}

function parseDetailsJson(raw: string | null): ParsedDetails {
  if (!raw) return { kind: "empty" };
  try {
    let parsed = JSON.parse(raw) as unknown;
    if (isObjectRecord(parsed)) {
      const obj = parsed;
      if ("_webhook_capture" in obj) {
        const next = { ...obj };
        delete next._webhook_capture;
        parsed = next;
      }
    }

    if (isObjectRecord(parsed)) {
      const obj = parsed;
      if (Object.keys(obj).length === 0) {
        return { kind: "empty" };
      }
      const source = firstString(obj.source, obj.via, obj.origin) ?? "—";
      const eventId =
        firstString(obj.event_id, obj.eventId, obj.id) ??
        firstString(isObjectRecord(obj.event) ? obj.event.id : undefined) ??
        "—";
      const emittedRaw = obj.emitted ?? obj.type;
      const emittedList = normalizeToStringList(emittedRaw);
      if (source !== "—" || eventId !== "—" || emittedList.length > 0) {
        const rows =
          emittedList.length > 0
            ? emittedList.map((type) => ({ eventId, type, source }))
            : [{ eventId, type: "—", source }];
        return { kind: "event_meta", rows };
      }
    }

    if (isChangesContainer(parsed)) {
      const changesRaw = parsed.changes;
      const changes = changesRaw
        .filter((entry): entry is { field?: unknown; before?: unknown; after?: unknown } =>
          isObjectRecord(entry)
        )
        .map((entry) => ({
          field: String(entry.field ?? "value"),
          before: entry.before,
          after: entry.after,
        }))
        .filter((entry) => !isSameValue(entry.before, entry.after));
      return { kind: "changes", items: changes };
    }

    const flat = flattenDetails(parsed);
    return {
      kind: "items",
      items: flat.map((item) => ({
        label: formatDetailLabel(item.path),
        value: stringifyDetailValue(item.value),
      })),
    };
  } catch {
    return { kind: "raw", raw };
  }
}

function formatForwardedChain(stream: ActiveApiStream): string {
  return stream.forwarded_chain.length > 0 ? stream.forwarded_chain.join(" -> ") : "—";
}

function firstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return null;
}

function normalizeToStringList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => firstString(item))
      .filter((item): item is string => !!item);
  }
  const single = firstString(value);
  return single ? [single] : [];
}

function flattenDetails(value: unknown, path = ""): Array<{ path: string; value: unknown }> {
  if (!isObjectRecord(value)) {
    return [{ path: path || "value", value }];
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return [{ path: path || "value", value: "[]" }];
    const hasNestedObjects = value.some((item) => item !== null && typeof item === "object");
    if (!hasNestedObjects) {
      return [{ path: path || "value", value }];
    }
    return value.flatMap((item, index) =>
      flattenDetails(item, `${path || "value"}[${index + 1}]`)
    );
  }

  const entries = Object.entries(value);
  if (entries.length === 0) return [{ path: path || "value", value: "{}" }];

  return entries.flatMap(([key, nested]) =>
    flattenDetails(nested, path ? `${path}.${key}` : key)
  );
}

function stringifyDetailValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value.map((item) => stringifyDetailValue(item)).join(", ");
  }
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function isSameValue(a: unknown, b: unknown): boolean {
  return stringifyComparable(a) === stringifyComparable(b);
}

function stringifyComparable(value: unknown): string {
  if (value === undefined) return "__undefined__";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatDetailLabel(path: string): string {
  const labelAliases: Record<string, string> = {
    emitted: "Type",
  };
  const segments = path.split(".");
  return segments
    .map((segment) => {
      const match = /^([^\[]+)(\[\d+\])?$/.exec(segment);
      const base = match?.[1] ?? segment;
      const index = match?.[2] ?? "";
      const spaced = base
        .replace(/_/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\s+/g, " ")
        .trim();
      const title = spaced
        .split(" ")
        .filter(Boolean)
        .map((word) => word[0]?.toUpperCase() + word.slice(1))
        .join(" ");
      const normalized = title
        .replace(/\bId\b/g, "ID")
        .replace(/\bIp\b/g, "IP")
        .replace(/\bApi\b/g, "API")
        .replace(/\bUrl\b/g, "URL");
      const alias = labelAliases[base.toLowerCase()];
      return `${alias ?? normalized}${index}`;
    })
    .join(" > ");
}

function extractWebhookCapture(raw: string | null): WebhookCapture | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObjectRecord(parsed)) return null;
    const root = parsed;
    const capture = root._webhook_capture;
    if (!isObjectRecord(capture)) return null;
    const captureObj = capture;
    const level = String(captureObj.captured_at_log_level ?? "").trim().toLowerCase();
    if (level !== "debug") return null;
    if (!("payload" in captureObj)) return null;
    return {
      capturedAtLogLevel: "debug",
      payload: captureObj.payload,
    };
  } catch {
    return null;
  }
}

function formatWebhookPayload(payload: unknown): string {
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isChangesContainer(value: unknown): value is { changes: unknown[] } {
  return isObjectRecord(value) && Array.isArray(value.changes);
}

function isWebhookLog(row: LogRow): boolean {
  return row.category === "webhook";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Logs: 0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value >= 100 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
  return `Logs: ${rounded} ${units[unitIndex]}`;
}
