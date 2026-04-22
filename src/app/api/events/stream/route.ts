import { getSession } from "@/lib/auth";
import { offBusEvent, onBusEvent } from "@/lib/events-bus";
import type { BusEvent, BusEventName, BusEventPayloadMap } from "@/lib/shared-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = <Name extends BusEventName>(
        name: Name,
        data: BusEventPayloadMap[Name]
      ) => {
        if (closed) return;
        const chunk = `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      // initial comment to open the stream on some proxies
      controller.enqueue(encoder.encode(": connected\n\n"));

      const listener = (e: BusEvent) => send(e.name, e.data);
      onBusEvent(listener);

      // periodic keep-alive
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
        offBusEvent(listener);
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
