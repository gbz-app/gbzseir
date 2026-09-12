"use client";

import * as React from "react";
import { routes } from "@/core/routes";
import type { ClientListConfig, GuideChipDef, GuideEntry } from "@/features/guide/components/list-config";

/** One whole guide list, as GET /rehber/dizin/<slug> sends it and /rehber/[kategori] renders it. */
export type GuideDataset = {
  /** False when part of the list could not be loaded (the rows that did load are still there). */
  ok: boolean;
  config: ClientListConfig;
  entries: GuideEntry[];
  chips: GuideChipDef[];
  /** ATM / Şube switch counts (ATM and bank lists only). */
  bankCounts?: { atm: number; bank: number };
};

/** A list the page already rendered, handed to the explore screen so it does not fetch it again. */
export type GuideDatasetSeed = { slug: string; data: GuideDataset };

export type GuideDatasetState = {
  data: GuideDataset | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
};

const TTL_MS = 10 * 60_000;
/** Per-list cache, so switching chips back and forth is instant (stale-while-revalidate after 10 minutes). */
const cache = new Map<string, { at: number; data: GuideDataset }>();

/**
 * Every row of one guide list (`slug`; null for none) for the explore screen: the module cache first, then the page's
 * `seed` (the list /rehber/[kategori] rendered), else GET /rehber/dizin/<slug>. Only complete answers are cached.
 */
export function useGuideDataset(slug: string | null, seed?: GuideDatasetSeed | null): GuideDatasetState {
  const [nonce, setNonce] = React.useState(0);
  const requestKey = slug ? `${slug}#${nonce}` : "";
  const [state, setState] = React.useState<{ key: string; data: GuideDataset | null; error: string | null }>({ key: "", data: null, error: null });
  // A retry always fetches, even when the page sent the list.
  const seeded = slug && nonce === 0 && seed?.slug === slug ? seed.data : null;

  React.useEffect(() => {
    if (!slug) return;
    const hit = cache.get(slug);
    if (hit && Date.now() - hit.at < TTL_MS) return;
    if (seeded?.ok) {
      cache.set(slug, { at: Date.now(), data: seeded });
      return;
    }
    let active = true;
    fetch(routes.guide.dataset(slug))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: GuideDataset) => {
        if (!data || !Array.isArray(data.entries) || !data.config) throw new Error("bad answer");
        if (data.ok) cache.set(slug, { at: Date.now(), data });
        if (active) setState({ key: requestKey, data, error: null });
      })
      .catch(() => {
        if (active) setState({ key: requestKey, data: null, error: "Liste yüklenemedi. İnternet bağlantını kontrol edip tekrar dene." });
      });
    return () => {
      active = false;
    };
  }, [slug, requestKey, seeded]);

  const retry = React.useCallback(() => {
    if (slug) cache.delete(slug);
    setNonce((n) => n + 1);
  }, [slug]);

  if (!slug) return { data: null, loading: false, error: null, retry };
  if (state.key === requestKey) return { data: state.data ?? cache.get(slug)?.data ?? null, loading: false, error: state.data ? null : state.error, retry };
  const hit = cache.get(slug)?.data ?? seeded;
  if (hit) return { data: hit, loading: false, error: null, retry };
  return { data: null, loading: true, error: null, retry };
}
