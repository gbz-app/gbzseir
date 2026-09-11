"use client";

import { useMemo, useSyncExternalStore } from "react";

const MINUTE = 60_000;
const toMinute = (ms: number) => Math.floor(ms / MINUTE) * MINUTE;

function subscribe(onChange: () => void): () => void {
  const id = window.setInterval(onChange, 30_000);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", onChange);
  };
}

const clientSnapshot = () => toMinute(Date.now());

/**
 * Current time rounded to the minute. The first render (server and hydration) uses the server's render time, then it
 * follows the device clock, so cached pages drop sessions that have started since.
 */
export function useNow(serverNow: string): Date {
  const server = toMinute(Date.parse(serverNow));
  const t = useSyncExternalStore(subscribe, clientSnapshot, () => server);
  return useMemo(() => new Date(t), [t]);
}
