"use client";

import * as React from "react";

let hiddenRequests = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** True while at least one <HideBottomNav/> is mounted. */
export function useBottomNavHidden(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => hiddenRequests > 0,
    () => false,
  );
}

/**
 * Render this anywhere in a page (e.g. detail pages with their own sticky action bar) to hide the bottom nav
 * while the page is mounted.
 */
export function HideBottomNav() {
  React.useEffect(() => {
    hiddenRequests += 1;
    emit();
    return () => {
      hiddenRequests -= 1;
      emit();
    };
  }, []);
  return null;
}

/** Hide-on-scroll-down helper; resets on navigation (keyed by `resetKey`). */
export function useHideOnScroll(resetKey: string, threshold = 10): boolean {
  const [state, setState] = React.useState<{ key: string; hidden: boolean }>({ key: resetKey, hidden: false });
  React.useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const y = window.scrollY;
        const dy = y - lastY;
        if (Math.abs(dy) > threshold) {
          setState({ key: resetKey, hidden: dy > 0 && y > 120 });
          lastY = y;
        }
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [resetKey, threshold]);
  return state.key === resetKey && state.hidden;
}

/** True once the page is scrolled more than `offset` px. */
export function useScrolled(offset = 4): boolean {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > offset);
    const id = window.setTimeout(onScroll, 0);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("scroll", onScroll);
    };
  }, [offset]);
  return scrolled;
}
