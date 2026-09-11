"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-provider";

const listeners = new Set<() => void>();

/** Ask every mounted useUnreadNotifications() to re-fetch (e.g. after marking notifications read). */
export function refreshUnreadNotifications() {
  listeners.forEach((l) => l());
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
  const refresh = React.useCallback(() => setTick((t) => t + 1), []);

  React.useEffect(() => {
    listeners.add(refresh);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      listeners.delete(refresh);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [refresh]);

  React.useEffect(() => {
    if (!user) return;
    let active = true;
    createClient()
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null)
      // Admin notices (links into the separate admin site) are shown in the admin panel only.
      .or("link.is.null,link.not.like./admin*")
      .then(({ count, error }) => {
        if (active && !error) setState({ uid: user.id, count: count ?? 0 });
      });
    return () => {
      active = false;
    };
  }, [user, tick]);

  return { count: user && state.uid === user.id ? state.count : 0, refresh };
}
