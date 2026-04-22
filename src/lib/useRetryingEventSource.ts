"use client";

import { useEffect, useRef } from "react";

type UseRetryingEventSourceOptions = {
  url: string;
  eventNames: string[];
  onEvent: () => void;
  onConnectionChange?: (connected: boolean) => void;
  retryMs?: number;
};

export function useRetryingEventSource({
  url,
  eventNames,
  onEvent,
  onConnectionChange,
  retryMs = 10_000,
}: UseRetryingEventSourceOptions) {
  const retryTimerRef = useRef<number | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let disposed = false;
    const handleEvent = () => onEvent();

    const cleanupSource = () => {
      const source = sourceRef.current;
      if (!source) return;

      for (const eventName of eventNames) {
        source.removeEventListener(eventName, handleEvent);
      }
      source.onopen = null;
      source.onerror = null;
      source.close();
      sourceRef.current = null;
    };

    const scheduleReconnect = () => {
      if (disposed || retryTimerRef.current != null) return;
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        connect();
      }, retryMs);
    };

    const connect = () => {
      if (disposed) return;

      const source = new EventSource(url);
      sourceRef.current = source;

      source.onopen = () => {
        if (disposed || sourceRef.current !== source) return;
        onConnectionChange?.(true);
      };

      source.onerror = () => {
        if (disposed || sourceRef.current !== source) return;
        onConnectionChange?.(false);
        cleanupSource();
        scheduleReconnect();
      };

      for (const eventName of eventNames) {
        source.addEventListener(eventName, handleEvent);
      }
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimerRef.current != null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      cleanupSource();
    };
  }, [eventNames, onConnectionChange, onEvent, retryMs, url]);
}
