"use client";

import * as React from "react";

type Entry = { at: number; data: unknown };
const memory = new Map<string, Entry>();

export type JsonState<T> = { data: T | null; error: boolean; loading: boolean; reload: () => void };

/**
 * Tiny GET-JSON hook with an in-memory cache shared across components (per tab).
 * `url = null` means "not yet" (e.g. fetch only once a sheet opens).
 */
export function useJson<T>(url: string | null, maxAgeMs = 10 * 60_000): JsonState<T> {
  const [state, setState] = React.useState<{ key: string | null; data: T | null; error: boolean }>({ key: null, data: null, error: false });
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    if (!url) return;
    let active = true;
    const hit = memory.get(url);
    const request: Promise<unknown> =
      nonce === 0 && hit && Date.now() - hit.at < maxAgeMs
        ? Promise.resolve(hit.data)
        : fetch(url, { headers: { Accept: "application/json" } })
            .then((r) => {
              if (!r.ok) throw new Error(String(r.status));
              return r.json();
            })
            .then((data: unknown) => {
              memory.set(url, { at: Date.now(), data });
              return data;
            });
    request
      .then((data) => active && setState({ key: url, data: data as T, error: false }))
      .catch(() => active && setState({ key: url, data: null, error: true }));
    return () => {
      active = false;
    };
  }, [url, nonce, maxAgeMs]);

  const reload = React.useCallback(() => {
    setState((s) => ({ ...s, data: null, error: false }));
    setNonce((n) => n + 1);
  }, []);

  const mine = state.key === url;
  const data = mine ? state.data : null;
  const error = mine && state.error;
  return { data, error, loading: !!url && !data && !error, reload };
}
