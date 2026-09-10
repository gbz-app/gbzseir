"use client";

import * as React from "react";
import { Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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

/** "Daha fazla yükle": fetches the next pages (20 each) in the browser with the same filters. Re-key on filter change. */
export function LoadMore({ resolved, type, seenIds }: LoadMoreProps) {
  const [items, setItems] = React.useState<ListingCardData[]>([]);
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState<"idle" | "loading" | "error" | "done">("idle");

  const load = async () => {
    setStatus("loading");
    const res = await fetchListingsPage(createClient(), resolved, page);
    if (res.error) {
      setStatus("error");
      return;
    }
    setItems((prev) => {
      const seen = new Set([...seenIds, ...prev.map((i) => i.id)]);
      return [...prev, ...res.items.filter((i) => !seen.has(i.id))];
    });
    setPage((p) => p + 1);
    setStatus(res.hasMore ? "idle" : "done");
  };

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

      {status === "done" ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Tüm ilanları gördün.</p>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-2">
          {status === "error" ? (
            <p role="alert" className="text-sm text-destructive">
              İlanlar yüklenemedi. Bağlantını kontrol edip tekrar dene.
            </p>
          ) : null}
          <Button type="button" variant="outline" size="lg" className="w-full" onClick={load} disabled={status === "loading"}>
            {status === "loading" ? <Loader2 className="animate-spin" /> : status === "error" ? <RotateCw /> : null}
            {status === "error" ? "Tekrar dene" : status === "loading" ? "Yükleniyor…" : "Daha fazla yükle"}
          </Button>
        </div>
      )}
    </>
  );
}
