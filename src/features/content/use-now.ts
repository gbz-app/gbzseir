"use client";

import { useSyncExternalStore } from "react";

const STEP_MS = 30_000;

function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, STEP_MS);
  const onVisible = () => {
    if (document.visibilityState === "visible") onChange();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

// Bucketed so repeated reads within the same 30 s window return the same value (stable snapshot).
function getSnapshot() {
  return Math.floor(Date.now() / STEP_MS) * STEP_MS;
}

/**
 * Current time for time-sensitive labels on cached pages ("Şu an sürüyor", expired announcements).
 * Hydrates with the server's render time (no mismatch), then follows the device clock.
 */
export function useNow(serverNow: number): number {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverNow);
}
