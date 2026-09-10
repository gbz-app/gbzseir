"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-contract";
import { trCompare } from "@/core/tr";
import type { Neighbourhood } from "@/lib/types";

type Row = Record<string, unknown>;

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Map a neighbourhoods row to the app type (tolerates lat/lng or latitude/longitude columns). */
export function toNeighbourhood(row: Row): Neighbourhood {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    slug: (row.slug as string | null) ?? null,
    district: ((row.district_name ?? row.district) as string | null) ?? null,
    lat: num(row.lat ?? row.latitude ?? row.center_lat),
    lng: num(row.lng ?? row.longitude ?? row.center_lng),
  };
}

let cache: Neighbourhood[] | null = null;
let inflight: Promise<Neighbourhood[]> | null = null;

/** Fetch all neighbourhoods once per tab (sorted with Turkish collation). */
export function loadNeighbourhoods(force = false): Promise<Neighbourhood[]> {
  if (cache && !force) return Promise.resolve(cache);
  if (inflight && !force) return inflight;
  inflight = (async () => {
    const { data, error } = await createClient().from(TABLES.neighbourhoods).select("*").limit(1000);
    if (error) throw new Error(error.message);
    const list = ((data as Row[] | null) ?? []).map(toNeighbourhood).filter((n) => n.name);
    list.sort((a, b) => trCompare(a.name, b.name));
    cache = list;
    return list;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Client hook: { neighbourhoods, loading, error, reload }. */
export function useNeighbourhoods(): {
  neighbourhoods: Neighbourhood[];
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [state, setState] = React.useState<{ list: Neighbourhood[]; loading: boolean; error: string | null }>(() => ({
    list: cache ?? [],
    loading: !cache,
    error: null,
  }));
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    loadNeighbourhoods(nonce > 0)
      .then((list) => active && setState({ list, loading: false, error: null }))
      .catch(() => active && setState((s) => ({ ...s, loading: false, error: "Mahalleler yüklenemedi." })));
    return () => {
      active = false;
    };
  }, [nonce]);

  const reload = React.useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    setNonce((n) => n + 1);
  }, []);
  return { neighbourhoods: state.list, loading: state.loading, error: state.error, reload };
}
