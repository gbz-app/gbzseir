"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-provider";

type Listener = { refresh: () => void; adjust: (update: (count: number) => number) => void };

const listeners = new Set<Listener>();

/** Ask every mounted useUnreadNotifications() to re-fetch (e.g. after marking notifications read). */
export function refreshUnreadNotifications() {
  listeners.forEach((l) => l.refresh());
}

/**
 * Optimistically change the count of every mounted useUnreadNotifications() (home bell, profile badge,
 * bottom-nav dot) before the server confirms: `() => 0` for "Tümünü okundu yap", `(c) => c - 1` for one.
 * Results of counts fetched before the change are dropped. Always call refreshUnreadNotifications() once the
 * write settles: it confirms the real count and also undoes a failed write.
 */
export function adjustUnreadNotifications(update: (count: number) => number) {
  listeners.forEach((l) => l.adjust(update));
}

/**
 * Unread notifications count of the signed-in user (0 for guests).
 * Re-fetches every 60 s, on tab focus and when refreshUnreadNotifications() is called.
 * Expects public.notifications(user_id uuid, read_at timestamptz null).
 */
export function useUnreadNotifications(): { count: number; refresh: () => void } {
  const { user } = useAuth();
  const [state, setState] = React.useState<{ uid: string | null; count: number }>({ uid: null, count: 0 });
  const [tick, setTick] = React.useState(0);
  // Bumped by optimistic adjustments so a count fetched before them cannot bring a cleared dot back.
  const version = React.useRef(0);
  const refresh = React.useCallback(() => setTick((t) => t + 1), []);
  const adjust = React.useCallback((update: (count: number) => number) => {
    version.current += 1;
    setState((s) => ({ ...s, count: Math.max(0, update(s.count)) }));
  }, []);

  React.useEffect(() => {
    const listener: Listener = { refresh, adjust };
    listeners.add(listener);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      listeners.delete(listener);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [refresh, adjust]);

  React.useEffect(() => {
    if (!user) return;
    let active = true;
    const startedAt = version.current;
    createClient()
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null)
      // Admin notices (links into the separate admin site) are shown in the admin panel only.
      .or("link.is.null,link.not.like./admin*")
      .then(({ count, error }) => {
        if (active && !error && startedAt === version.current) setState({ uid: user.id, count: count ?? 0 });
      });
    return () => {
      active = false;
    };
  }, [user, tick]);

  return { count: user && state.uid === user.id ? state.count : 0, refresh };
}
