"use client";

import * as React from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

export type AuthContextValue = {
  /** Signed-in user or null. */
  user: User | null;
  /** True until the initial session has been read. */
  loading: boolean;
  /** public.profiles row of the user (null for guests or while loading). */
  profile: Profile | null;
  profileLoading: boolean;
  /** Re-fetch the profile (call after updating it). */
  refreshProfile: () => Promise<Profile | null>;
  signOut: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

/** Keeps auth + profile state in sync with Supabase (onAuthStateChange). Mounted once in AppProviders. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = React.useState(false);
  const currentUid = React.useRef<string | null>(null);

  const loadProfile = React.useCallback(
    async (uid: string | null): Promise<Profile | null> => {
      if (!uid) {
        setProfile(null);
        setProfileLoading(false);
        return null;
      }
      setProfileLoading(true);
      const { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
      const p = (data as Profile | null) ?? null;
      if (currentUid.current === uid) setProfile(p);
      setProfileLoading(false);
      return p;
    },
    [supabase],
  );

  React.useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      const changedUser = currentUid.current !== (u?.id ?? null);
      currentUid.current = u?.id ?? null;
      setUser(u);
      setLoading(false);
      if (changedUser || event === "USER_UPDATED") {
        // Never await Supabase calls inside this callback (auth lock); defer instead.
        setTimeout(() => void loadProfile(u?.id ?? null), 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase, loadProfile]);

  const refreshProfile = React.useCallback(() => loadProfile(currentUid.current), [loadProfile]);

  const signOut = React.useCallback(async () => {
    await supabase.auth.signOut();
    // Forget pages/data cached by the service worker on this device.
    try {
      navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_PAGES" });
    } catch {
      /* no service worker */
    }
  }, [supabase]);

  const value = React.useMemo<AuthContextValue>(
    () => ({ user, loading, profile, profileLoading, refreshProfile, signOut }),
    [user, loading, profile, profileLoading, refreshProfile, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Full auth context. */
export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** { user, loading } */
export function useUser(): { user: User | null; loading: boolean } {
  const { user, loading } = useAuth();
  return { user, loading };
}

/** { profile, loading, refresh } — loading covers both session and profile fetch. */
export function useProfile(): { profile: Profile | null; loading: boolean; refresh: () => Promise<Profile | null> } {
  const { profile, loading, profileLoading, refreshProfile } = useAuth();
  return { profile, loading: loading || profileLoading, refresh: refreshProfile };
}
