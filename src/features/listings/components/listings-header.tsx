"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpDown, Briefcase, Search, SlidersHorizontal, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes, type ListingsTab } from "@/core/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChipFilter } from "@/components/shared/chip-filter";
import { SEARCH_MAX, SORT_OPTIONS, type SortKey } from "../constants";
import { countActiveFilters, emptyQuery, listingsHref, listingsQueryToRecord, type ListingsQuery } from "../filters";
import type { ListingCategory, NeighbourhoodRef } from "../types";
import { FilterSheet } from "./filter-sheet";
import { useListingsNav } from "./listings-nav";

const TABS: Array<{ tab: ListingsTab; label: string; icon: typeof Tag }> = [
  { tab: "ikinci-el", label: "2. El", icon: Tag },
  { tab: "is-ilanlari", label: "İş İlanları", icon: Briefcase },
];

export type ListingsHeaderProps = {
  query: ListingsQuery;
  /** Categories of the current tab. */
  categories: ListingCategory[];
  neighbourhood: NeighbourhoodRef | null;
  total: number | null;
};

/** E1 header: tabs, search, Filtre + Sırala, category chips. All state lives in the URL. */
export function ListingsHeader({ query, categories, neighbourhood, total }: ListingsHeaderProps) {
  const { navigate, pending } = useListingsNav();
  const isJob = query.tab === "is-ilanlari";

  // Keep the input in sync with the URL (adjusting state while rendering, no effect needed).
  const [text, setText] = React.useState(query.q);
  const [syncedQ, setSyncedQ] = React.useState(query.q);
  if (syncedQ !== query.q) {
    setSyncedQ(query.q);
    setText(query.q);
  }

  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [sheetKey, setSheetKey] = React.useState(0);
  const filterCount = countActiveFilters(query);

  const tops = categories.filter((c) => !c.parent_id);
  const selected = query.kategori ? categories.find((c) => c.slug === query.kategori) : undefined;
  const chipOptions = [
    { value: "", label: "Tümü" },
    ...(selected?.parent_id ? [{ value: selected.slug, label: selected.name }] : []),
    ...tops.map((c) => ({ value: c.slug, label: c.name })),
  ];

  const hidden = Object.entries(listingsQueryToRecord({ ...query, q: "" })).filter(([, v]) => v !== undefined && v !== null && v !== "");

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur?.();
    navigate({ ...query, q: text.trim().slice(0, SEARCH_MAX) }, { push: true });
  };

  const sortLabel = SORT_OPTIONS.find((s) => s.value === query.sirala)?.label ?? "En yeni";

  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="İlan türü" className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
        {TABS.map((t) => {
          const active = t.tab === query.tab;
          const target = { ...emptyQuery(t.tab), q: query.q };
          const Icon = t.icon;
          return (
            <Link
              key={t.tab}
              href={listingsHref(target)}
              scroll={false}
              aria-current={active ? "page" : undefined}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                if (!active) navigate(target, { push: true });
              }}
              className={cn(
                "flex h-11 items-center justify-center gap-2 rounded-xl text-[15px] font-bold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-[18px]" aria-hidden />
              {t.label}
            </Link>
          );
        })}
      </nav>

      <form role="search" action={routes.listings.root()} method="get" onSubmit={submit} className="relative">
        {hidden.map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={String(v)} />
        ))}
        <input type="hidden" name="tab" value={query.tab} />
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          name="q"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={SEARCH_MAX}
          enterKeyHint="search"
          autoComplete="off"
          aria-label={isJob ? "İş ilanlarında ara" : "2. el ilanlarda ara"}
          placeholder={isJob ? "Pozisyon, firma ya da OSB ara" : "Ne arıyorsun? Örn. bisiklet"}
          className="h-12 rounded-2xl pr-12 pl-11 [&::-webkit-search-cancel-button]:hidden"
        />
        {text ? (
          <button
            type="button"
            aria-label="Aramayı temizle"
            onClick={() => {
              setText("");
              if (query.q) navigate({ ...query, q: "" }, { push: true });
            }}
            className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        ) : null}
      </form>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          aria-label={filterCount ? `Filtre, ${filterCount} seçili` : "Filtre"}
          onClick={() => {
            setSheetKey((k) => k + 1);
            setSheetOpen(true);
          }}
        >
          <SlidersHorizontal />
          Filtre
          {filterCount ? (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{filterCount}</span>
          ) : null}
        </Button>
        {!isJob ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="rounded-full" aria-label={`Sıralama: ${sortLabel}`}>
                <ArrowUpDown />
                {sortLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuLabel className="px-2 py-1.5 text-xs text-muted-foreground">Sırala</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={query.sirala} onValueChange={(v) => navigate({ ...query, sirala: v as SortKey })}>
                {SORT_OPTIONS.map((o) => (
                  <DropdownMenuRadioItem key={o.value} value={o.value} className="min-h-11 text-[15px]">
                    {o.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <p className="ml-auto truncate text-sm text-muted-foreground" aria-live="polite">
          {pending ? "Yükleniyor…" : total != null ? `${total.toLocaleString("tr-TR")} ${isJob ? "iş ilanı" : "ilan"}` : null}
        </p>
      </div>

      {tops.length ? (
        <ChipFilter
          ariaLabel={isJob ? "Sektörler" : "Kategoriler"}
          size="sm"
          options={chipOptions}
          value={query.kategori ?? ""}
          onChange={(v) => navigate({ ...query, kategori: v || null })}
        />
      ) : null}

      <FilterSheet
        key={sheetKey}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        query={query}
        categories={categories}
        neighbourhood={neighbourhood}
        onApply={(q) => navigate(q)}
      />
    </div>
  );
}
