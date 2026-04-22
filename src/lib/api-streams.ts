import "server-only";

import crypto from "node:crypto";
import { getClientIpDetails } from "./request";
import type { ActiveApiStream } from "./shared-types";

declare global {
  var __crestHouseAccessApiStreams: Map<string, ActiveApiStream> | undefined;
}

function getRegistry() {
  if (!globalThis.__crestHouseAccessApiStreams) {
    globalThis.__crestHouseAccessApiStreams = new Map<string, ActiveApiStream>();
  }
  return globalThis.__crestHouseAccessApiStreams;
}

export function registerApiStream(request: Request, actor: string, path: string): string {
  const origin = getClientIpDetails(request);
  const id = crypto.randomUUID();

  getRegistry().set(id, {
    id,
    actor,
    connected_at: new Date().toISOString(),
    ip: origin.ip,
    ip_source: origin.source,
    forwarded_chain: origin.chain,
    user_agent: request.headers.get("user-agent")?.trim() || null,
    path,
    bytes_in: 0,
    bytes_out: 0,
  });

  return id;
}

export function unregisterApiStream(id: string) {
  const stream = getRegistry().get(id) ?? null;
  getRegistry().delete(id);
  return stream;
}

export function trackApiStreamInbound(id: string, bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return;
  const stream = getRegistry().get(id);
  if (!stream) return;
  stream.bytes_in += bytes;
}

export function trackApiStreamOutbound(id: string, bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return;
  const stream = getRegistry().get(id);
  if (!stream) return;
  stream.bytes_out += bytes;
}

export function listActiveApiStreams(): ActiveApiStream[] {
  return Array.from(getRegistry().values()).sort((a, b) =>
    a.connected_at < b.connected_at ? 1 : a.connected_at > b.connected_at ? -1 : 0
  );
}
