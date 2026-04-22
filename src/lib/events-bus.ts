import { EventEmitter } from "node:events";
import type { BusEvent, BusEventName, BusEventPayloadMap } from "./shared-types";

declare global {
  var __crestHouseAccessBus: EventEmitter | undefined;
}

/** Process-wide pub/sub for live dashboard updates (SSE fan-out). */
export function getBus(): EventEmitter {
  if (!globalThis.__crestHouseAccessBus) {
    const b = new EventEmitter();
    b.setMaxListeners(0); // no artificial cap — one listener per SSE client
    globalThis.__crestHouseAccessBus = b;
  }
  return globalThis.__crestHouseAccessBus;
}

export function emit<Name extends BusEventName>(
  name: Name,
  data: BusEventPayloadMap[Name]
) {
  const event = { name, data } as BusEvent;
  getBus().emit("evt", event);
}

export function onBusEvent(listener: (event: BusEvent) => void) {
  getBus().on("evt", listener);
}

export function offBusEvent(listener: (event: BusEvent) => void) {
  getBus().off("evt", listener);
}
