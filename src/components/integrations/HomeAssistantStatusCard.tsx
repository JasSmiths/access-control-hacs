"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatDateTime } from "@/lib/format";

type HomeAssistantHeartbeat = {
  integration_key: string;
  source: "poll" | "stream";
  heartbeat_ms: number;
  snapshot_generated_at: string;
  measured_at: string;
  updated_at: string;
};

type HeartbeatResponse = {
  heartbeat: HomeAssistantHeartbeat | null;
  age_ms: number | null;
  is_stale: boolean;
};

function formatHeartbeatMs(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.max(0, Math.round(value))} ms`;
}

function formatAgeMs(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "No heartbeat received yet";
  if (value < 1000) return `${Math.max(0, Math.round(value))} ms ago`;
  if (value < 60_000) return `${Math.round(value / 1000)}s ago`;
  return `${Math.round(value / 60_000)}m ago`;
}

export function HomeAssistantStatusCard() {
  const [data, setData] = useState<HeartbeatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/integrations/home-assistant", {
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error((await res.text()) || "Failed to load Home Assistant heartbeat");
        }

        const payload = (await res.json()) as HeartbeatResponse;
        if (!cancelled) {
          setData(payload);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Request failed");
        }
      }
    }

    void load();
    const id = window.setInterval(() => {
      void load();
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const badge = !data?.heartbeat
    ? <Badge tone="warning">Waiting for heartbeat</Badge>
    : data.is_stale
      ? <Badge tone="warning">Stale</Badge>
      : <Badge tone="success">Live</Badge>;

  return (
    <Card className="max-w-xl">
      <CardHeader className="flex items-center justify-between gap-3">
        <CardTitle>Home Assistant heartbeat</CardTitle>
        {badge}
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-[var(--fg-muted)]">
          Latest end-to-end sync sample reported by the Home Assistant integration after it receives a snapshot from this app.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="text-xs uppercase tracking-wide text-[var(--fg-muted)]">Heartbeat</div>
            <div className="mt-1 text-2xl font-semibold text-[var(--fg)]">
              {formatHeartbeatMs(data?.heartbeat?.heartbeat_ms)}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="text-xs uppercase tracking-wide text-[var(--fg-muted)]">Last seen</div>
            <div className="mt-1 text-2xl font-semibold text-[var(--fg)]">
              {formatAgeMs(data?.age_ms)}
            </div>
          </div>
        </div>

        {data?.heartbeat ? (
          <div className="space-y-2 text-sm text-[var(--fg-muted)]">
            <p>
              Transport: <span className="font-medium text-[var(--fg)]">{data.heartbeat.source}</span>
            </p>
            <p>
              Snapshot generated: <span className="font-medium text-[var(--fg)]">{formatDateTime(data.heartbeat.snapshot_generated_at)}</span>
            </p>
            <p>
              Heartbeat measured: <span className="font-medium text-[var(--fg)]">{formatDateTime(data.heartbeat.measured_at)}</span>
            </p>
            <p>
              Report received in app: <span className="font-medium text-[var(--fg)]">{formatDateTime(data.heartbeat.updated_at)}</span>
            </p>
          </div>
        ) : null}

        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      </CardBody>
    </Card>
  );
}
