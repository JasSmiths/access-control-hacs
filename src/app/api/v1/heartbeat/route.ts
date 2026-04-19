import { verifyApiKey } from "@/lib/api-keys";
import { auditLog } from "@/lib/audit";
import {
  getHomeAssistantHeartbeatStatus,
  recordHomeAssistantHeartbeat,
} from "@/lib/home-assistant-heartbeat";

export const dynamic = "force-dynamic";

function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth) return null;
  const [scheme, value] = auth.split(" ");
  if (!scheme || !value) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return value.trim();
}

export async function POST(request: Request) {
  const token = extractBearerToken(request);
  if (!token) return new Response("Missing bearer token", { status: 401 });

  const key = verifyApiKey(token);
  if (!key) return new Response("Invalid API key", { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const body = payload as
    | {
        source?: unknown;
        heartbeat_ms?: unknown;
        snapshot_generated_at?: unknown;
        measured_at?: unknown;
      }
    | undefined;

  const source = body?.source === "stream" ? "stream" : body?.source === "poll" ? "poll" : "";
  const heartbeatMs =
    typeof body?.heartbeat_ms === "number" && Number.isFinite(body.heartbeat_ms)
      ? Math.round(body.heartbeat_ms)
      : Number.NaN;
  const snapshotGeneratedAt =
    typeof body?.snapshot_generated_at === "string" ? body.snapshot_generated_at.trim() : "";
  const measuredAt =
    typeof body?.measured_at === "string" ? body.measured_at.trim() : "";

  if (
    !source ||
    !Number.isFinite(heartbeatMs) ||
    heartbeatMs < 0 ||
    !snapshotGeneratedAt ||
    Number.isNaN(Date.parse(snapshotGeneratedAt)) ||
    !measuredAt ||
    Number.isNaN(Date.parse(measuredAt))
  ) {
    return new Response("Invalid heartbeat payload", { status: 400 });
  }

  recordHomeAssistantHeartbeat({
    source,
    heartbeatMs,
    snapshotGeneratedAt,
    measuredAt,
  });

  auditLog({
    category: "api",
    action: "api.heartbeat_received",
    message: `Home Assistant heartbeat received over ${source}.`,
    request,
    path: "/api/v1/heartbeat",
    actor: `api_key:${key.key_prefix}`,
    details: { source, heartbeatMs, snapshotGeneratedAt, measuredAt },
  });

  return Response.json({
    ok: true,
    ...getHomeAssistantHeartbeatStatus(),
  });
}
