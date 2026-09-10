"use client";

import * as React from "react";
import { FavoriteButton } from "@/components/shared/favorite-button";
import { createClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-contract";
import { useAuth } from "@/lib/auth/auth-provider";

type FavoritesState = { ready: boolean; has: (id: string) => boolean; set: (id: string, favorited: boolean) => void };

const FavoritesContext = React.createContext<FavoritesState | null>(null);

/**
 * Loads the signed-in user's listing favorites ONCE for a whole list (instead of one lookup per card).
 * Guests are "ready" immediately (every heart is empty; tapping one sends them to login).
 */
export function ListingFavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [state, setState] = React.useState<{ uid: string | null; ids: Set<string> }>({ uid: null, ids: new Set() });

  React.useEffect(() => {
    if (!user) return;
    let active = true;
    createClient()
      .from(TABLES.favorites)
      .select("target_id")
      .eq("user_id", user.id)
      .eq("target_type", "listing")
      .limit(1000)
      .then(({ data }) => {
        if (active) setState({ uid: user.id, ids: new Set((data ?? []).map((r) => String(r.target_id))) });
      });
    return () => {
      active = false;
    };
  }, [user]);

  const value = React.useMemo<FavoritesState>(() => {
    const ids = user && state.uid === user.id ? state.ids : new Set<string>();
    return {
      ready: !loading && (!user || state.uid === user.id),
      has: (id) => ids.has(id),
      set: (id, favorited) =>
        setState((s) => {
          const next = new Set(s.ids);
          if (favorited) next.add(id);
          else next.delete(id);
          return { ...s, ids: next };
        }),
    };
  }, [user, loading, state]);

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

/** Heart for a listing card; uses the provider's batch lookup when present. */
export function ListingFavoriteButton({ listingId, variant = "ghost", className }: { listingId: string; variant?: "ghost" | "overlay"; className?: string }) {
  const ctx = React.useContext(FavoritesContext);
  if (!ctx) return <FavoriteButton targetType="listing" targetId={listingId} variant={variant} className={className} />;
  return (
    <FavoriteButton
      key={ctx.ready ? "ready" : "pending"}
      targetType="listing"
      targetId={listingId}
      variant={variant}
      className={className}
      initialFavorited={ctx.ready ? ctx.has(listingId) : false}
      onChange={(fav) => ctx.set(listingId, fav)}
    />
  );
}
