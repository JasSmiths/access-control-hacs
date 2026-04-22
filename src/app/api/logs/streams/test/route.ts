import crypto from "node:crypto";
import { getSession } from "@/lib/auth";
import { emit } from "@/lib/events-bus";
import { listActiveApiStreams, trackApiStreamInbound } from "@/lib/api-streams";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_OUTBOUND_BYTES = 512 * 1024;
const DEFAULT_INBOUND_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const DEFAULT_CHUNKS = 8;
const MAX_CHUNKS = 64;

function toPositiveInteger(input: unknown, fallback: number): number {
  if (typeof input !== "number" || !Number.isFinite(input)) return fallback;
  return Math.max(1, Math.floor(input));
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const rawBody = await request.text();
  const requestBytes = new TextEncoder().encode(rawBody).byteLength;

  let requestedOutboundBytes = DEFAULT_OUTBOUND_BYTES;
  let requestedInboundBytes = DEFAULT_INBOUND_BYTES;
  let requestedChunks = DEFAULT_CHUNKS;
  try {
    const body = JSON.parse(rawBody) as {
      outboundBytes?: unknown;
      inboundBytes?: unknown;
      chunks?: unknown;
    };
    requestedOutboundBytes = toPositiveInteger(body.outboundBytes, DEFAULT_OUTBOUND_BYTES);
    requestedInboundBytes = toPositiveInteger(body.inboundBytes, DEFAULT_INBOUND_BYTES);
    requestedChunks = toPositiveInteger(body.chunks, DEFAULT_CHUNKS);
  } catch {
    // ignore and use defaults
  }

  const activeStreams = listActiveApiStreams();
  if (activeStreams.length === 0) {
    return Response.json(
      { ok: false, reason: "no_active_streams" },
      { status: 409 }
    );
  }

  const totalBytes = Math.min(MAX_TOTAL_BYTES, requestedOutboundBytes);
  const inboundBytes = Math.min(MAX_TOTAL_BYTES, requestedInboundBytes);
  const chunks = Math.min(MAX_CHUNKS, requestedChunks);
  const chunkBytes = Math.max(1, Math.floor(totalBytes / chunks));
  const countedInboundBytes = Math.max(requestBytes, inboundBytes);
  const inboundPerStream = Math.max(
    1,
    Math.floor(countedInboundBytes / activeStreams.length)
  );

  for (const stream of activeStreams) {
    trackApiStreamInbound(stream.id, inboundPerStream);
  }

  emit("stream.transfer_test", {
    id: crypto.randomUUID(),
    chunk_bytes: chunkBytes,
    chunks,
  });

  return Response.json({
    ok: true,
    streams: activeStreams.length,
    totalBytesPerStream: chunkBytes * chunks,
    inboundBytesTotal: inboundPerStream * activeStreams.length,
    chunks,
    chunkBytes,
  });
}
