"use client";

import * as React from "react";

/**
 * iOS Safari ignores `user-scalable=no`, so page pinch-zoom is blocked through its gesture events.
 * Map canvases keep their own pinch handling (they use touch events, not gesture events).
 */
export function NoZoom() {
  React.useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    const opts = { passive: false } as const;
    document.addEventListener("gesturestart", prevent, opts);
    document.addEventListener("gesturechange", prevent, opts);
    document.addEventListener("gestureend", prevent, opts);
    return () => {
      document.removeEventListener("gesturestart", prevent);
      document.removeEventListener("gesturechange", prevent);
      document.removeEventListener("gestureend", prevent);
    };
  }, []);
  return null;
}
