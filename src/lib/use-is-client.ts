"use client";

import * as React from "react";

const noopSubscribe = () => () => {};

/** false during SSR and hydration, true afterwards. Use to render browser-only UI without hydration mismatches. */
export function useIsClient(): boolean {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
