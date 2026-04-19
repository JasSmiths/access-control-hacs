import { loadDashboard } from "@/lib/dashboard";
import { verifyApiKey } from "@/lib/api-keys";
import { auditLog } from "@/lib/audit";
import { getBus } from "@/lib/events-bus";
import { getLatestGateSignal } from "@/lib/gate-signals";

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
      level: "warn",
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
      level: "warn",
      category: "api",
      action: "api.auth_failed",
      message: "API stream rejected: invalid API key.",
      request,
      path: "/api/v1/stream",
    });
    return new Response("Invalid API key", { status: 401 });
  }

  const encoder = new TextEncoder();
  const bus = getBus();

  auditLog({
    category: "api",
    action: "api.stream_connected",
    message: "API realtime stream connected.",
    request,
    path: "/api/v1/stream",
    actor: `api_key:${key.key_prefix}`,
  });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (eventName: string, data: unknown) => {
        if (closed) return;
        try {
          const chunk = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
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
            actor: `api_key:${key.key_prefix}`,
            details: {
              error: error instanceof Error ? error.message : String(error),
            },
          });
          send("error", { ok: false, reason: "snapshot_failed" });
        }
      };

      controller.enqueue(encoder.encode(": connected\n\n"));
      sendSnapshot();

      const listener = () => sendSnapshot();
      bus.on("evt", listener);

      const ping = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          closed = true;
        }
      }, 25_000);

      const onAbort = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        bus.off("evt", listener);
        try {
          controller.close();
        } catch {
          /* ignore */
        }
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
