"use client";

import * as React from "react";
import { Loader2, RotateCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ListingType } from "../constants";
import type { ResolvedSearch } from "../filters";
import { fetchListingsPage } from "../search";
import type { ListingCardData } from "../types";
import { ClassifiedCard, JobCard } from "./listing-cards";

export type LoadMoreProps = {
  resolved: ResolvedSearch;
  type: ListingType;
  /** Ids already rendered by the server (deduplicated if new listings shift the pages). */
  seenIds: string[];
};

const PILL =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-card px-6 text-[15px] font-semibold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-[18px]";

/**
 * Infinite list: the next pages (20 each) load in the browser with the same filters when the end of the list comes
 * near; "Daha fazla göster" is the fallback. Re-key on filter change.
 */
export function LoadMore({ resolved, type, seenIds }: LoadMoreProps) {
  const [items, setItems] = React.useState<ListingCardData[]>([]);
  const [status, setStatus] = React.useState<"idle" | "loading" | "error" | "done">("idle");
  const page = React.useRef(1);
  const busy = React.useRef(false);
  const sentinel = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setStatus("loading");
    const res = await fetchListingsPage(createClient(), resolved, page.current);
    busy.current = false;
    if (res.error) {
      setStatus("error");
      return;
    }
    page.current += 1;
    setItems((prev) => {
      const seen = new Set([...seenIds, ...prev.map((i) => i.id)]);
      return [...prev, ...res.items.filter((i) => !seen.has(i.id))];
    });
    setStatus(res.hasMore ? "idle" : "done");
  }, [resolved, seenIds]);

  // Auto-load when the sentinel is within ~600 px of the viewport (re-armed after every page).
  React.useEffect(() => {
    const el = sentinel.current;
    if (status !== "idle" || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void load();
    }, { rootMargin: "0px 0px 600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [status, load]);

  return (
    <>
      {items.length ? (
        type === "classified" ? (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((i) => (
              <ClassifiedCard key={i.id} item={i} headingLevel="h2" />
            ))}
          </ul>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {items.map((i) => (
              <JobCard key={i.id} item={i} headingLevel="h2" />
            ))}
          </ul>
        )
      ) : null}

      <div ref={sentinel} className="flex min-h-16 flex-col items-center justify-center gap-2 pt-5 pb-2">
        {status === "done" ? (
          <p className="text-sm text-muted-foreground">{type === "job" ? "Tüm iş ilanlarını gördün." : "Tüm ilanları gördün."}</p>
        ) : status === "error" ? (
          <>
            <p role="alert" className="text-center text-sm text-destructive">
              İlanlar yüklenemedi. Bağlantını kontrol edip tekrar dene.
            </p>
            <button type="button" onClick={() => void load()} className={PILL}>
              <RotateCw aria-hidden /> Tekrar dene
            </button>
          </>
        ) : status === "loading" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Yükleniyor…
          </p>
        ) : (
          <button type="button" onClick={() => void load()} className={PILL}>
            Daha fazla göster
          </button>
        )}
      </div>
    </>
  );
}
