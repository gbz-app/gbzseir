"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDownAZ, List, Map as MapIcon, Navigation, Search, SearchX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { distanceMeters } from "@/core/geo";
import { routes } from "@/core/routes";
import { trNormalize } from "@/core/tr";
import { Button } from "@/components/ui/button";
import { ChipFilter, type ChipOption } from "@/components/shared/chip-filter";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { parseOwnership } from "@/features/guide/lib/constants";
import type { Ownership } from "@/features/guide/lib/types";
import { KIND_META } from "@/features/nearby/config";
import { useReferencePoint } from "@/features/nearby/lib/use-reference-point";
import { entryDimValue, guideListHref, type GuideChipDef, type GuideEntry, type GuideListConfig } from "./list-config";
import { GuideCard } from "./guide-card";
import { GuideMapView } from "./guide-map-view";

/** The serializable part of a GuideListConfig the client needs. */
export type ClientListConfig = Pick<GuideListConfig, "slug" | "title" | "kind" | "chip" | "chipParam" | "preset" | "ownership" | "bankSwitch">;

export type GuideListBrowserProps = {
  config: ClientListConfig;
  entries: GuideEntry[];
  chips: GuideChipDef[];
  /** False when (part of) the list could not be loaded. */
  ok: boolean;
  /** ATM / Şube switch counts. */
  bankCounts?: { atm: number; bank: number };
};

const STEP = 40;
const ALL = "tumu";

type ViewMode = "liste" | "harita";
type SortMode = "az" | "yakin";

type Filters = { chip: string | null; own: Ownership | null; q: string; view: ViewMode };

function initialFilters(config: ClientListConfig, chips: GuideChipDef[], params: URLSearchParams | null): Filters {
  const valid = (v: string | null | undefined) => (v && chips.some((c) => c.value === v) ? v : null);
  const raw = params?.get(config.chipParam)?.toLowerCase().replace(/-/g, "_");
  return {
    chip: valid(raw) ?? valid(config.preset),
    own: config.ownership ? parseOwnership(params?.get("sahiplik")) : null,
    q: params?.get("q")?.slice(0, 80) ?? "",
    view: params?.get("gorunum") === "harita" ? "harita" : "liste",
  };
}

/** Pill switch (radio group). */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Array<{ value: T; label: string; icon?: React.ComponentType<{ className?: string }> }>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex shrink-0 rounded-full bg-card p-1">
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon ? <Icon className="size-4" aria-hidden /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** ATM / Şube: links between /rehber/atm and /rehber/banka. */
function BankSwitch({ current, counts }: { current: ClientListConfig["kind"]; counts?: { atm: number; bank: number } }) {
  const items = [
    { kind: "atm", label: "ATM", href: routes.guide.category("atm"), count: counts?.atm },
    { kind: "bank", label: "Şube", href: routes.guide.category("banka"), count: counts?.bank },
  ] as const;
  return (
    <nav aria-label="ATM ya da banka şubesi" className="grid grid-cols-2 rounded-full bg-card p-1">
      {items.map((it) => {
        const active = it.kind === current;
        return (
          <Link
            key={it.kind}
            href={it.href}
            replace
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {it.label}
            {typeof it.count === "number" ? <span className={cn("text-xs font-medium", active ? "text-primary-foreground/80" : "")}>{it.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * /rehber/[kategori] list: search, chip row (category / group / subkind / bank / brand / operator), Devlet / Özel,
 * A-Z or nearest first, list or map. Every row is server-rendered into `entries`; filtering is local and mirrored into
 * the URL (?alt=, ?banka=, ?marka=, ?operator=, ?sahiplik=, ?q=, ?gorunum=harita) with history.replaceState.
 */
export function GuideListBrowser({ config, entries, chips, ok, bankCounts, params = null }: GuideListBrowserProps & { params?: URLSearchParams | null }) {
  const [filters, setFilters] = React.useState<Filters>(() => initialFilters(config, chips, params));
  const [sort, setSort] = React.useState<SortMode>("az");
  const [limit, setLimit] = React.useState(STEP);
  const { point } = useReferencePoint();
  const searchRef = React.useRef<HTMLInputElement>(null);

  const update = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setLimit(STEP);
  };

  // Mirror the filters into the URL once they differ from what the page opened with (not on mount).
  const key = `${filters.chip}|${filters.own}|${filters.q}|${filters.view}`;
  const firstKey = React.useRef(key);
  const touched = React.useRef(false);
  React.useEffect(() => {
    if (!touched.current && key === firstKey.current) return;
    touched.current = true;
    const href = guideListHref(config, { chip: filters.chip, own: filters.own, q: filters.q, map: filters.view === "harita" });
    window.history.replaceState(null, "", href);
  }, [key, config, filters]);

  const hasBothOwnerships = React.useMemo(
    () => config.ownership && entries.some((e) => e.own === "devlet") && entries.some((e) => e.own === "ozel"),
    [config.ownership, entries],
  );

  const words = React.useMemo(() => trNormalize(filters.q).split(" ").filter(Boolean), [filters.q]);
  const pre = React.useMemo(
    () => entries.filter((e) => (!filters.own || e.own === filters.own) && words.every((w) => e.q.includes(w))),
    [entries, filters.own, words],
  );
  const dim = config.chip;
  const chipOptions = React.useMemo<ChipOption[]>(() => {
    if (!dim || chips.length < 2) return [];
    const counts = new Map<string, number>();
    for (const e of pre) {
      const v = entryDimValue(e, dim);
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [{ value: ALL, label: "Tümü", count: pre.length }, ...chips.map((c) => ({ value: c.value, label: c.label, count: counts.get(c.value) ?? 0 }))];
  }, [dim, chips, pre]);

  const filtered = React.useMemo(() => {
    const list = dim && filters.chip ? pre.filter((e) => entryDimValue(e, dim) === filters.chip) : pre;
    if (sort !== "yakin" || !point) return list;
    const d = (e: GuideEntry) => (typeof e.lat === "number" && typeof e.lng === "number" ? distanceMeters(point, { lat: e.lat, lng: e.lng }) : Infinity);
    return [...list].sort((a, b) => d(a) - d(b));
  }, [pre, dim, filters.chip, sort, point]);

  const filtersActive = !!filters.chip || !!filters.own || !!filters.q;
  const clearFilters = () => update({ chip: null, own: null, q: "" });
  const visible = filtered.slice(0, limit);
  const KindIcon = KIND_META[config.kind].icon;

  return (
    <>
      <PageHeader title={config.title} subtitle={entries.length ? `${entries.length} kayıt` : undefined} backHref={routes.guide.root()} />
      <div className="flex flex-col gap-3.5 px-4 pt-2 pb-8">
        {config.bankSwitch ? <BankSwitch current={config.kind} counts={bankCounts} /> : null}

        {entries.length ? (
          <div role="search" className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={filters.q}
              onChange={(e) => update({ q: e.target.value.slice(0, 80) })}
              placeholder="İsim, mahalle ya da adres ara"
              aria-label={`${config.title} içinde ara`}
              enterKeyHint="search"
              autoComplete="off"
              className="h-12 w-full rounded-full bg-card pr-12 pl-12 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
            />
            {filters.q ? (
              <button
                type="button"
                onClick={() => {
                  update({ q: "" });
                  searchRef.current?.focus();
                }}
                aria-label="Aramayı temizle"
                className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}

        {chipOptions.length ? (
          <ChipFilter
            options={chipOptions}
            value={filters.chip ?? ALL}
            onChange={(v) => update({ chip: !v || v === ALL ? null : v })}
            ariaLabel="Alt kategori"
            size="sm"
          />
        ) : null}

        {hasBothOwnerships ? (
          <Segmented<"hepsi" | Ownership>
            ariaLabel="Devlet ya da özel"
            value={filters.own ?? "hepsi"}
            onChange={(v) => update({ own: v === "hepsi" ? null : v })}
            options={[
              { value: "hepsi", label: "Tümü" },
              { value: "devlet", label: "Devlet" },
              { value: "ozel", label: "Özel" },
            ]}
          />
        ) : null}

        {entries.length ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-muted-foreground tabular-nums" aria-live="polite">
                {filtered.length} sonuç
              </p>
              {point && filters.view === "liste" ? (
                <button
                  type="button"
                  onClick={() => setSort((s) => (s === "az" ? "yakin" : "az"))}
                  className="inline-flex h-8 items-center gap-1 rounded-full bg-card px-3 text-xs font-semibold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-label={sort === "az" ? "En yakından uzağa sırala" : "A'dan Z'ye sırala"}
                >
                  {sort === "az" ? <Navigation className="size-3.5" aria-hidden /> : <ArrowDownAZ className="size-3.5" aria-hidden />}
                  {sort === "az" ? "En yakın" : "A-Z"}
                </button>
              ) : null}
            </div>
            <Segmented<ViewMode>
              ariaLabel="Görünüm"
              value={filters.view}
              onChange={(v) => update({ view: v })}
              options={[
                { value: "liste", label: "Liste", icon: List },
                { value: "harita", label: "Harita", icon: MapIcon },
              ]}
            />
          </div>
        ) : null}

        {!ok && entries.length ? (
          <p className="rounded-2xl bg-highlight-soft px-4 py-3 text-xs font-medium text-highlight-foreground dark:text-highlight">Listenin bir kısmı yüklenemedi. Sayfayı yenileyip tekrar dene.</p>
        ) : null}

        {!entries.length ? (
          ok ? (
            <EmptyState
              icon={KindIcon}
              title="Bu kategoride henüz kayıt yok"
              description="Rehberdeki diğer kategorilere göz atabilirsin."
              actionLabel="Rehbere dön"
              actionHref={routes.guide.root()}
            />
          ) : (
            <ErrorState description="Liste şu an yüklenemedi. Biraz sonra tekrar dene." />
          )
        ) : filtered.length === 0 ? (
          <EmptyState
            compact
            icon={SearchX}
            tone="default"
            title="Sonuç bulunamadı"
            description={filters.q.trim() ? `"${filters.q.trim()}" için kayıt bulamadık. Farklı bir kelime dene.` : "Bu filtrelerle kayıt yok."}
            action={
              filtersActive ? (
                <Button type="button" variant="secondary" className="rounded-full" onClick={clearFilters}>
                  Filtreleri temizle
                </Button>
              ) : undefined
            }
          />
        ) : filters.view === "harita" ? (
          <GuideMapView entries={filtered} title={config.title} />
        ) : (
          <>
            <ul className="flex flex-col gap-2.5" aria-label={config.title}>
              {visible.map((e) => (
                <li key={e.id}>
                  <GuideCard entry={e} />
                </li>
              ))}
            </ul>
            {filtered.length > visible.length ? (
              <Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => setLimit((n) => n + STEP)}>
                Daha fazla göster ({filtered.length - visible.length})
              </Button>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

/** The browser with the URL's filters (wrap in <Suspense> whose fallback is <GuideListBrowser> without params). */
export function GuideListBrowserFromUrl(props: GuideListBrowserProps) {
  const params = useSearchParams();
  return <GuideListBrowser {...props} params={params} />;
}
