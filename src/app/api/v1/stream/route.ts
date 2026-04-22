import { registerApiStream, unregisterApiStream } from "@/lib/api-streams";
import { loadDashboard } from "@/lib/dashboard";
import { verifyApiKey } from "@/lib/api-keys";
import { auditLog } from "@/lib/audit";
import { offBusEvent, onBusEvent } from "@/lib/events-bus";
import { getLatestGateSignal } from "@/lib/gate-signals";
import type { BusEvent, JsonValue } from "@/lib/shared-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth) return null;
  const [scheme, value] = auth.split(" ");
  if (!scheme || !value) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return value.trim();
}

function buildSnapshot() {
  const snapshot = loadDashboard();
  return {
    ok: true,
    generated_at: new Date().toISOString(),
    contractors: snapshot.contractors,
    people: snapshot.people,
    on_site: snapshot.openSessions.length,
    flagged_today: snapshot.flaggedToday,
    open_sessions: snapshot.openSessions,
    recent_events: snapshot.recent,
    latest_gate_signal: getLatestGateSignal(),
  };
}

export async function GET(request: Request) {
  const token = extractBearerToken(request);
  if (!token) {
    auditLog({
      level: "debug",
      category: "api",
      action: "api.auth_failed",
      message: "API stream rejected: missing bearer token.",
      request,
      path: "/api/v1/stream",
    });
    return new Response("Missing bearer token", { status: 401 });
  }

  const key = verifyApiKey(token);
  if (!key) {
    auditLog({
      level: "debug",
      category: "api",
      action: "api.auth_failed",
      message: "API stream rejected: invalid API key.",
      request,
      path: "/api/v1/stream",
    });
    return new Response("Invalid API key", { status: 401 });
  }

  const encoder = new TextEncoder();
  const actor = `api_key:${key.key_prefix}`;
  const streamId = registerApiStream(request, actor, "/api/v1/stream");

  auditLog({
    level: "info",
    category: "api",
    action: "api.stream_connected",
    message: "API realtime stream connected.",
    request,
    path: "/api/v1/stream",
    actor,
  });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const connectedAt = new Date();
      let ping: ReturnType<typeof setInterval> | null = null;
      let listener: ((e: BusEvent) => void) | null = null;

      const closeStream = (reason: string) => {
        if (closed) return;
        closed = true;
        if (ping) clearInterval(ping);
        if (listener) offBusEvent(listener);
        const activeStream = unregisterApiStream(streamId);
        auditLog({
          level: "info",
          category: "api",
          action: "api.stream_disconnected",
          message: "API realtime stream disconnected.",
          request,
          path: "/api/v1/stream",
          actor,
          details: {
            reason,
            connected_at: activeStream?.connected_at ?? connectedAt.toISOString(),
            duration_seconds: Math.max(
              0,
              Math.round((Date.now() - connectedAt.getTime()) / 1000)
            ),
          },
        });
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      const send = (eventName: string, data: JsonValue) => {
        if (closed) return;
        try {
          const chunk = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closeStream("write_failed");
        }
      };

      const sendSnapshot = () => {
        try {
          send("snapshot", buildSnapshot());
        } catch (error) {
          auditLog({
            level: "error",
            category: "api",
            action: "api.stream_snapshot_failed",
            message: "API realtime stream snapshot failed.",
            request,
            path: "/api/v1/stream",
            actor,
            details: {
              error: error instanceof Error ? error.message : String(error),
            },
          });
          send("error", { ok: false, reason: "snapshot_failed" });
        }
      };

      controller.enqueue(encoder.encode(": connected\n\n"));
      sendSnapshot();

      listener = () => sendSnapshot();
      onBusEvent(listener);

      ping = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          closeStream("ping_failed");
        }
      }, 25_000);

      const onAbort = () => {
        closeStream("client_aborted");
      };

      request.signal.addEventListener("abort", onAbort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
