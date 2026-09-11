"use client";

import * as React from "react";
import { ArrowUpDown, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CITY } from "@/config/site";
import { routes } from "@/core/routes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExploreHeader } from "@/components/shared/explore-header";
import { SEARCH_MAX, SORT_OPTIONS, WORK_TYPES, type SortKey } from "../constants";
import {
  attributeFilterFields,
  countActiveFilters,
  emptyQuery,
  listingsQueryToRecord,
  pickAttrFilters,
  type ListingsQuery,
} from "../filters";
import type { ListingCategory, NeighbourhoodRef } from "../types";
import { CategoryIcon } from "./category-icon";
import { FilterSheet } from "./filter-sheet";
import { useListingsNav } from "./listings-nav";

const COPY = {
  "ikinci-el": {
    title: "İkinci El",
    subtitle: `${CITY.name}'de aracısız al, sat; satıcıyı doğrudan ara.`,
    placeholder: "Ne arıyorsun? Örn. bisiklet",
    searchLabel: "İkinci el ilanlarda ara",
    noun: "ilan",
    chipsLabel: "Kategoriler",
  },
  "is-ilanlari": {
    title: "İş İlanları",
    subtitle: `${CITY.name} ve OSB'lerde güncel iş ilanları`,
    placeholder: "Pozisyon, firma ya da OSB ara",
    searchLabel: "İş ilanlarında ara",
    noun: "iş ilanı",
    chipsLabel: "Sektörler",
  },
} as const;

/** Pill chip of the list pages (black when active; no shadow or border). */
function Chip({ active, onClick, small, children }: { active: boolean; onClick: () => void; small?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0",
        small ? "h-8 px-3 text-[13px]" : "h-9 px-3.5 text-sm",
        active ? "bg-foreground font-semibold text-background" : "bg-card font-medium text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/** Contained horizontal scroll rail (the page itself never scrolls sideways). */
const RAIL = "no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5";

export type ListingsHeaderProps = {
  query: ListingsQuery;
  /** Categories of the page (2. el categories or job sectors). */
  categories: ListingCategory[];
  neighbourhood: NeighbourhoodRef | null;
  total: number | null;
};

/**
 * Header of the İkinci El / İş İlanları lists (/kesfet style): back circle, big title, search pill + filter button,
 * category chips (and work types for jobs), result count + sort. All state lives in the URL.
 */
export function ListingsHeader({ query, categories, neighbourhood, total }: ListingsHeaderProps) {
  const { navigate, pending } = useListingsNav();
  const isJob = query.tab === "is-ilanlari";
  const copy = COPY[query.tab];

  // Keep the input in sync with the URL (adjusting state while rendering, no effect needed).
  const [text, setText] = React.useState(query.q);
  const [syncedQ, setSyncedQ] = React.useState(query.q);
  if (syncedQ !== query.q) {
    setSyncedQ(query.q);
    setText(query.q);
  }

  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [sheetKey, setSheetKey] = React.useState(0);
  // Only attribute filters the category really has (hand-edited or outdated links).
  const filterCount = countActiveFilters({ ...query, attrs: pickAttrFilters(query.attrs, attributeFilterFields(categories, query.kategori)) });
  // The button counts what only the sheet shows (category and work type are visible as chips).
  const sheetCount = filterCount - (query.kategori ? 1 : 0) - (isJob && query.calisma ? 1 : 0);

  const tops = categories.filter((c) => !c.parent_id);
  const selected = query.kategori ? categories.find((c) => c.slug === query.kategori) : undefined;

  const hidden = Object.entries(listingsQueryToRecord({ ...query, q: "" })).filter(([, v]) => v !== undefined && v !== null && v !== "");

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur?.();
    navigate({ ...query, q: text.trim().slice(0, SEARCH_MAX) }, { push: true });
  };

  const setCategory = (slug: string | null) => navigate({ ...query, kategori: slug, attrs: {} });
  const clearFilters = () => navigate({ ...emptyQuery(query.tab), q: query.q, sirala: query.sirala });
  const openFilters = () => {
    setSheetKey((k) => k + 1);
    setSheetOpen(true);
  };

  const sortLabel = SORT_OPTIONS.find((s) => s.value === query.sirala)?.label ?? "En yeni";

  return (
    <div className="flex flex-col gap-4">
      <ExploreHeader title={copy.title} subtitle={copy.subtitle} backHref={routes.home()} />

      <div className="flex items-center gap-2">
        <form role="search" action={routes.listings.root(query.tab)} method="get" onSubmit={submit} className="relative min-w-0 flex-1">
          {hidden.map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={String(v)} />
          ))}
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            name="q"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={SEARCH_MAX}
            enterKeyHint="search"
            autoComplete="off"
            aria-label={copy.searchLabel}
            placeholder={copy.placeholder}
            className="h-12 w-full rounded-full bg-card pr-11 pl-12 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
          />
          {text ? (
            <button
              type="button"
              aria-label="Aramayı temizle"
              onClick={() => {
                setText("");
                if (query.q) navigate({ ...query, q: "" }, { push: true });
              }}
              className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </form>
        <button
          type="button"
          onClick={openFilters}
          aria-label={sheetCount > 0 ? `Filtrele, ${sheetCount} seçili` : "Filtrele"}
          className={cn(
            "relative flex size-12 shrink-0 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            sheetCount > 0 ? "bg-foreground text-background" : "bg-card text-foreground hover:bg-muted",
          )}
        >
          <SlidersHorizontal className="size-5" aria-hidden />
          {sheetCount > 0 ? (
            <span aria-hidden className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              {sheetCount}
            </span>
          ) : null}
        </button>
      </div>

      {tops.length ? (
        <div className={RAIL} role="group" aria-label={copy.chipsLabel}>
          <Chip active={!query.kategori} onClick={() => setCategory(null)}>
            Tümü
          </Chip>
          {selected?.parent_id ? (
            <Chip active onClick={() => setCategory(null)}>
              {selected.name}
            </Chip>
          ) : null}
          {tops.map((c) => (
            <Chip key={c.id} active={query.kategori === c.slug} onClick={() => setCategory(query.kategori === c.slug ? null : c.slug)}>
              <CategoryIcon iconName={c.icon} fallback={isJob ? "briefcase" : "tag"} />
              {c.name}
            </Chip>
          ))}
        </div>
      ) : null}

      {isJob ? (
        <div className={RAIL} role="group" aria-label="Çalışma şekli">
          {WORK_TYPES.map((w) => (
            <Chip key={w.value} small active={query.calisma === w.value} onClick={() => navigate({ ...query, calisma: query.calisma === w.value ? null : w.value })}>
              {w.label}
            </Chip>
          ))}
        </div>
      ) : null}

      <div className="-my-1 flex min-h-9 items-center gap-3">
        <p className="min-w-0 truncate text-sm text-muted-foreground" aria-live="polite">
          {pending ? "Yükleniyor…" : total != null ? `${total.toLocaleString("tr-TR")} ${copy.noun}` : null}
        </p>
        {filterCount > 0 ? (
          <button
            type="button"
            onClick={clearFilters}
            className="shrink-0 rounded-full text-sm font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Temizle
          </button>
        ) : null}
        {!isJob ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Sıralama: ${sortLabel}`}
                className="ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-card px-3.5 text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <ArrowUpDown className="size-4" aria-hidden />
                {sortLabel}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
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
      </div>

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
