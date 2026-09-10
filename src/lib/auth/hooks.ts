"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { routes } from "@/core/routes";
import type { BusinessSummary } from "@/lib/types";
import { useAuth } from "./auth-provider";

export { useAuth, useProfile, useUser } from "./auth-provider";

/** Current path + query, for use as ?next= (client side). */
export function useCurrentPath(): string {
  const pathname = usePathname();
  const [search, setSearch] = React.useState("");
  React.useEffect(() => {
    const update = () => setSearch(window.location.search);
    const id = window.setTimeout(update, 0);
    return () => window.clearTimeout(id);
  }, [pathname]);
  return `${pathname}${search}`;
}

/**
 * Returns `ensureAuth(next?)`: true when signed in; otherwise navigates to /giris?next=... and returns false.
 * Use in click handlers of actions that need an account (favorite, post listing, send request...).
 */
export function useRequireAuth(): (nextPath?: string) => boolean {
  const { user } = useAuth();
  const router = useRouter();
  return React.useCallback(
    (nextPath?: string) => {
      if (user) return true;
      const next = nextPath ?? `${window.location.pathname}${window.location.search}`;
      router.push(routes.auth.login(next));
      return false;
    },
    [user, router],
  );
}

/** Businesses owned by the signed-in user (client). */
export function useMyBusinesses(): { businesses: BusinessSummary[]; loading: boolean; isOwner: boolean; approved: BusinessSummary | null } {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = React.useState<{ uid: string | null; list: BusinessSummary[] }>({ uid: null, list: [] });

  React.useEffect(() => {
    if (!user) return;
    let active = true;
    createClient()
      .from("businesses")
      .select("*")
      .eq("owner_id", user.id)
      .then(({ data }) => {
        if (active) setState({ uid: user.id, list: (data as BusinessSummary[] | null) ?? [] });
      });
    return () => {
      active = false;
    };
  }, [user]);

  const list = user && state.uid === user.id ? state.list : [];
  const loading = authLoading || (!!user && state.uid !== user.id);
  return {
    businesses: list,
    loading,
    isOwner: list.length > 0,
    approved: list.find((b) => b.status === "approved") ?? null,
  };
}
