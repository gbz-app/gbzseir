"use client";

import * as React from "react";

/**
 * A shared ticking clock (one interval for the whole page). Used for duty windows, open/closed badges and
 * prayer countdowns so that cached (ISR / service worker) HTML never shows an expired state after hydration.
 */
const TICK_MS = 15_000;
let current = 0;
let timer: number | null = null;
const listeners = new Set<() => void>();

function refresh() {
  current = Date.now();
  listeners.forEach((l) => l());
}

function onVisibility() {
  if (document.visibilityState === "visible") refresh();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // React re-reads the snapshot right after subscribing, so a stale value is corrected immediately.
  if (Date.now() - current > 1000) current = Date.now();
  if (timer === null) {
    timer = window.setInterval(refresh, TICK_MS);
    document.addEventListener("visibilitychange", onVisibility);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}

function getSnapshot() {
  if (!current) current = Date.now();
  return current;
}

/**
 * Current time in ms, refreshed every 15 s and when the tab becomes visible again.
 * `serverNow` is used for SSR + hydration (pass the server render time to get identical HTML);
 * without it the server snapshot is 0, which callers should treat as "unknown".
 */
export function useNow(serverNow?: number): number {
  return React.useSyncExternalStore(subscribe, getSnapshot, () => serverNow ?? 0);
}
