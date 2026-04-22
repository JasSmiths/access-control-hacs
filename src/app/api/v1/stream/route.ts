import {
  registerApiStream,
  trackApiStreamInbound,
  trackApiStreamOutbound,
  unregisterApiStream,
} from "@/lib/api-streams";
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

function estimateRequestBytes(request: Request): number {
  let total = 0;
  total += request.method.length + request.url.length + 12;
  request.headers.forEach((value, key) => {
    total += key.length + value.length + 4;
  });
  return total;
}

function buildTransferTestPayload(testId: string, bytes: number, chunk: number, total: number) {
  const safeBytes = Math.min(Math.max(1, Math.floor(bytes)), 1024 * 1024);
  return {
    id: testId,
    chunk,
    total,
    generated_at: new Date().toISOString(),
    // Ephemeral filler so transfer rate can be validated without persisting data.
    payload: "x".repeat(safeBytes),
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
  trackApiStreamInbound(streamId, estimateRequestBytes(request));

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
          const encoded = encoder.encode(chunk);
          controller.enqueue(encoded);
          trackApiStreamOutbound(streamId, encoded.byteLength);
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

      {
        const connectedChunk = encoder.encode(": connected\n\n");
        controller.enqueue(connectedChunk);
        trackApiStreamOutbound(streamId, connectedChunk.byteLength);
      }
      sendSnapshot();

      listener = (event) => {
        if (event.name === "stream.transfer_test") {
          for (let index = 0; index < event.data.chunks; index += 1) {
            send(
              "transfer.test",
              buildTransferTestPayload(
                event.data.id,
                event.data.chunk_bytes,
                index + 1,
                event.data.chunks
              )
            );
          }
          return;
        }
        sendSnapshot();
      };
      onBusEvent(listener);

      ping = setInterval(() => {
        if (closed) return;
        try {
          const pingChunk = encoder.encode(": ping\n\n");
          controller.enqueue(pingChunk);
          trackApiStreamOutbound(streamId, pingChunk.byteLength);
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
