"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Search, SearchX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trNormalize } from "@/core/tr";
import { routes } from "@/core/routes";
import { ServiceIconBubble } from "./service-icon";

export type ServiceSearchItem = {
  slug: string;
  name: string;
  icon: string | null;
  parentName: string;
  /** Name, synonyms and parent words (any case/accents). */
  terms: string[];
};

type Indexed = ServiceSearchItem & { normName: string; normAll: string };

function rank(item: Indexed, q: string, words: string[]): number {
  if (!words.every((w) => item.normAll.includes(w))) return -1;
  if (item.normName.startsWith(q)) return 0;
  if (item.normName.includes(q)) return 1;
  if (words.every((w) => item.normName.includes(w))) return 2;
  return 3;
}

/**
 * F1 search: Turkish-insensitive client-side filter over sub-categories (names, synonyms, parent names).
 * While the query is empty the server-rendered `children` (popular grid, categories, how it works) are shown.
 */
export function ServiceSearch({ items, children }: { items: ServiceSearchItem[]; children: React.ReactNode }) {
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const indexed = React.useMemo<Indexed[]>(
    () => items.map((it) => ({ ...it, normName: trNormalize(it.name), normAll: trNormalize([it.name, ...it.terms].join(" ")) })),
    [items],
  );
  const q = trNormalize(query);
  const results = React.useMemo(() => {
    if (!q) return [];
    const words = q.split(" ").filter(Boolean);
    return indexed
      .map((it) => ({ it, r: rank(it, q, words) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r)
      .slice(0, 20)
      .map((x) => x.it);
  }, [indexed, q]);

  return (
    <div className="flex flex-col gap-6">
      <div role="search" className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hangi hizmete ihtiyacın var?"
          aria-label="Hangi hizmete ihtiyacın var?"
          enterKeyHint="search"
          autoComplete="off"
          className="h-14 rounded-2xl pr-12 pl-12 text-base shadow-soft [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Aramayı temizle"
            className="absolute top-1/2 right-1.5 flex size-11 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite">
        {q ? (results.length ? `${results.length} hizmet bulundu` : "Sonuç bulunamadı") : ""}
      </p>

      {!q ? (
        children
      ) : results.length ? (
        <section aria-label="Arama sonuçları">
          <p className="mb-2 text-sm font-medium text-muted-foreground">{results.length} hizmet bulundu</p>
          <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">
            {results.map((r) => (
              <li key={r.slug}>
                <Link
                  href={routes.services.request(r.slug)}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted"
                >
                  <ServiceIconBubble name={r.icon} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.parentName}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-card px-6 py-10 text-center shadow-soft ring-1 ring-foreground/[0.06]">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <SearchX className="size-7" aria-hidden />
          </span>
          <p className="font-bold text-balance">&quot;{query.trim()}&quot; için bir hizmet bulamadık</p>
          <p className="max-w-xs text-sm text-muted-foreground">Farklı bir kelime dene ya da tüm kategorilere göz at.</p>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => setQuery("")}>
              Tüm kategoriler
            </Button>
            <Button asChild>
              <Link href={routes.services.category("diger-hizmetler")}>Diğer hizmetler</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
