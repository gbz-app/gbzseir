"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, LocateFixed, MapPinOff, Search, SearchX, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { districtBySlug, isDistrictSlug, type DistrictSlug } from "@/config/districts";
import { distanceMeters } from "@/core/geo";
import { routes } from "@/core/routes";
import { trNormalize } from "@/core/tr";
import { canGoBack } from "@/lib/navigation-history";
import { useApproxLocation } from "@/lib/location/use-approx-location";
import { Button } from "@/components/ui/button";
import { ChipFilter, type ChipOption } from "@/components/shared/chip-filter";
import { DataSourceNote, type DataSourceNoteProps } from "@/components/shared/data-source-note";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { GoogleMap } from "@/components/maps/google-map";
import { MapPattern } from "@/components/maps/map-states";
import type { FlyRequest, MapPadding, MapPoint } from "@/components/maps/types";
import { parseOwnership } from "@/features/guide/lib/constants";
import type { GuideListKind, Ownership } from "@/features/guide/lib/types";
import { KBB_SOURCE, KIND_META, OSM_COPYRIGHT_URL, OSM_SOURCE } from "@/features/nearby/config";
import { NEARBY_AREA_CLASS } from "@/features/nearby/components/nearby-explorer-skeleton";
import { NearbySheet, sheetOffsets, type SheetSnap } from "@/features/nearby/components/nearby-sheet";
import { entryDimValue, guideListHref, type ClientListConfig, type GuideChipDef, type GuideEntry } from "./list-config";
import { GuideCard } from "./guide-card";

/** Moved to ./list-config (shared with the explore screen and /rehber/dizin/<slug>); re-exported for older imports. */
export type { ClientListConfig } from "./list-config";

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
/** Space kept for the back button at the top of the map. */
const TOP_SPACE = 64;
/** Pins drawn at most (the nearest ones); the list keeps every row. */
const MAX_PINS = 400;
/** With a known location the first view fits the nearest N pins (like /yakinimda). */
const FIT_NEAREST = 8;

const BACK_BUTTON =
  "pointer-events-auto flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 motion-reduce:transition-none";

const NOTE = "mt-3 rounded-2xl bg-muted/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground";

/** `ilce` only comes from an old link (?ilce=): there is no district picking any more (owner 12.09). */
type Filters = { chip: string | null; own: Ownership | null; q: string; ilce: DistrictSlug | null };

type Pinned = GuideEntry & { lat: number; lng: number };
const hasPin = (e: GuideEntry): e is Pinned => typeof e.lat === "number" && typeof e.lng === "number";

function initialFilters(config: ClientListConfig, chips: GuideChipDef[], params: URLSearchParams | null): Filters {
  const valid = (v: string | null | undefined) => (v && chips.some((c) => c.value === v) ? v : null);
  const raw = params?.get(config.chipParam)?.toLowerCase().replace(/-/g, "_");
  const ilce = params?.get("ilce");
  return {
    chip: valid(raw) ?? valid(config.preset),
    own: config.ownership ? parseOwnership(params?.get("sahiplik")) : null,
    q: params?.get("q")?.slice(0, 80) ?? "",
    ilce: isDistrictSlug(ilce) ? ilce : null,
  };
}

/** Rows of the chip chosen by the path (server HTML), in the server's A-Z order. */
function presetRows(config: ClientListConfig, chips: GuideChipDef[], entries: GuideEntry[]): GuideEntry[] {
  const chip = initialFilters(config, chips, null).chip;
  const dim = config.chip;
  return dim && chip ? entries.filter((e) => entryDimValue(e, dim) === chip) : entries;
}

/** Data credit of a list (the OSM line wherever OSM data is listed). */
function sourceFor(kind: GuideListKind): DataSourceNoteProps {
  switch (kind) {
    case "institution":
      return { source: `Resmî kurum siteleri, ${OSM_SOURCE}`, sourceUrl: OSM_COPYRIGHT_URL, callAhead: true };
    case "ev_charge":
      return { source: OSM_SOURCE, sourceUrl: OSM_COPYRIGHT_URL, note: "Soket ve müsaitlik bilgisini operatörün uygulamasından kontrol et." };
    case "place":
      return { source: `${KBB_SOURCE}, ${OSM_SOURCE}`, sourceUrl: OSM_COPYRIGHT_URL };
    case "atm":
    case "bank":
    case "fuel":
      return { source: OSM_SOURCE, sourceUrl: OSM_COPYRIGHT_URL };
  }
}

/** Pill switch (radio group). */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex shrink-0 self-start rounded-full bg-card p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** ATM / Şube: links between /rehber/atm and /rehber/banka (in the sheet, like the Eczane tab's Nöbetçi switch). */
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
              "inline-flex h-9 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {it.label}
            {typeof it.count === "number" ? <span className={cn("text-xs font-medium", active ? "text-background/75" : "")}>{it.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function SheetTitle({ title, line }: { title: string; line: string }) {
  return (
    <div className="min-w-0">
      <h2 className="truncate text-lg leading-tight font-bold">{title}</h2>
      <p className="mt-0.5 truncate text-xs text-muted-foreground" aria-live="polite">
        {line}
      </p>
    </div>
  );
}

/** White rows of the sheet (detail taps go to /kurum/<slug> or /gezilecek-yerler/<slug>); the selected pin's row is tinted. */
function EntryRows({ entries, title, selectedId }: { entries: GuideEntry[]; title: string; selectedId: string | null }) {
  return (
    <ul className="flex flex-col gap-2.5" aria-label={title}>
      {entries.map((e) => (
        <li key={e.id} id={`rehber-${e.id}`}>
          <GuideCard entry={e} className={e.id === selectedId ? "bg-brand-soft hover:bg-brand-soft" : undefined} />
        </li>
      ))}
    </ul>
  );
}

/** The list sheet before the map area is measured (and in the server HTML): where the half-open sheet sits. */
function StaticSheet({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex h-[55%] flex-col rounded-t-3xl bg-background shadow-[0_-10px_30px_-12px_rgb(0_0_0/0.25)] ring-1 ring-foreground/[0.06]">
      <div className="flex h-8 shrink-0 items-center justify-center" aria-hidden>
        <span className="h-1.5 w-11 rounded-full bg-muted-foreground/35" />
      </div>
      <div className="shrink-0 px-4 pb-2.5">{header}</div>
      <div className="min-h-0 flex-1 overflow-hidden px-4">{children}</div>
    </div>
  );
}

/**
 * Server HTML and Suspense fallback of /rehber/[kategori]: the map placeholder, a back link and the first rows (for
 * crawlers and the first paint). Hook-free, so it renders on the server.
 */
export function GuideListFallback({ config, entries, chips }: GuideListBrowserProps) {
  const rows = presetRows(config, chips, entries);
  return (
    <div className={NEARBY_AREA_CLASS}>
      <MapPattern className="absolute inset-0" />
      <div className="absolute inset-x-0 top-0 z-20 px-4 pt-2.5">
        <Link href={routes.guide.root()} aria-label="Şehir rehberine dön" className={BACK_BUTTON}>
          <ArrowLeft className="size-5" strokeWidth={2.2} aria-hidden />
        </Link>
      </div>
      <StaticSheet header={<SheetTitle title={config.title} line={`${rows.length} kayıt`} />}>
        {rows.length ? <EntryRows entries={rows.slice(0, STEP)} title={config.title} selectedId={null} /> : null}
      </StaticSheet>
    </div>
  );
}

/**
 * /rehber/[kategori]: map-first like /yakinimda's taxi tab. Only a back button sits on the map; the draggable sheet holds
 * the filters, like the Eczane tab's Nöbetçi switch: ATM / Şube, the chips (category / group / subkind / bank / brand /
 * operator) and the search, then Devlet / Özel and every row (rows without a location only there), nearest first when a
 * location (or a district saved earlier) is known, else A-Z. No district picking (owner 12.09). Filters are local and
 * mirrored into the URL (?alt=, ?banka=, ?marka=, ?operator=, ?sahiplik=, ?q=) with history.replaceState. A pin tap
 * highlights and scrolls to its row; a row tap opens the detail page.
 */
export function GuideListBrowser({ config, entries, chips, ok, bankCounts, params = null }: GuideListBrowserProps & { params?: URLSearchParams | null }) {
  const router = useRouter();
  const loc = useApproxLocation();
  const [filters, setFilters] = React.useState<Filters>(() => initialFilters(config, chips, params));
  const [limit, setLimit] = React.useState(STEP);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [fly, setFly] = React.useState<FlyRequest | null>(null);
  const [snap, setSnap] = React.useState<SheetSnap>("half");
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const update = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setLimit(STEP);
    setSelectedId(null);
  };

  // Mirror the filters into the URL once they differ from what the page opened with (not on mount).
  const key = `${filters.chip}|${filters.own}|${filters.ilce}|${filters.q}`;
  const firstKey = React.useRef(key);
  const touched = React.useRef(false);
  React.useEffect(() => {
    if (!touched.current && key === firstKey.current) return;
    touched.current = true;
    window.history.replaceState(null, "", guideListHref(config, { chip: filters.chip, own: filters.own, q: filters.q, ilce: filters.ilce }));
  }, [key, config, filters]);

  const hasBothOwnerships = React.useMemo(
    () => config.ownership && entries.some((e) => e.own === "devlet") && entries.some((e) => e.own === "ozel"),
    [config.ownership, entries],
  );

  const q = trNormalize(filters.q);
  const words = React.useMemo(() => q.split(" ").filter(Boolean), [q]);
  const pre = React.useMemo(
    () =>
      entries.filter(
        (e) => (!filters.own || e.own === filters.own) && (!filters.ilce || e.district === filters.ilce) && words.every((w) => e.q.includes(w)),
      ),
    [entries, filters.own, filters.ilce, words],
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

  // Nearest first once a GPS fix or a district is known; the server's A-Z order otherwise.
  const byDistance = loc.pointSource !== "city";
  const { lat: refLat, lng: refLng } = loc.point;
  const filtered = React.useMemo(() => {
    const list = dim && filters.chip ? pre.filter((e) => entryDimValue(e, dim) === filters.chip) : pre;
    if (!byDistance) return list;
    const ref = { lat: refLat, lng: refLng };
    return list
      .map((e) => ({ e, d: hasPin(e) ? distanceMeters(ref, { lat: e.lat, lng: e.lng }) : Infinity }))
      .sort((a, b) => a.d - b.d)
      .map((x) => x.e);
  }, [pre, dim, filters.chip, byDistance, refLat, refLng]);

  // Pins: the filtered rows with a location, nearest to the reference point (or the city centre) first, capped.
  const pinned = React.useMemo<Pinned[]>(() => {
    const ref = { lat: refLat, lng: refLng };
    return filtered
      .filter(hasPin)
      .map((e) => ({ e, d: distanceMeters(ref, { lat: e.lat, lng: e.lng }) }))
      .sort((a, b) => a.d - b.d)
      .map((x) => x.e);
  }, [filtered, refLat, refLng]);
  const points = React.useMemo<MapPoint[]>(
    () => pinned.slice(0, MAX_PINS).map((e) => ({ id: e.id, lat: e.lat, lng: e.lng, kind: e.kind, label: e.name })),
    [pinned],
  );
  // No row of the page has a location: no billed map load, only the pattern.
  const anyPins = React.useMemo(() => entries.some(hasPin), [entries]);
  const missing = filtered.length - pinned.length;

  // The map refits to the results once typing pauses (not on every keystroke).
  const [fitQuery, setFitQuery] = React.useState(q);
  React.useEffect(() => {
    if (q === fitQuery) return;
    const id = window.setTimeout(() => setFitQuery(q), 450);
    return () => window.clearTimeout(id);
  }, [q, fitQuery]);
  const fitKey = points.length
    ? `${filters.chip}|${filters.own}|${filters.ilce}|${fitQuery}|${byDistance ? `${refLat.toFixed(3)},${refLng.toFixed(3)}` : "az"}`
    : "";

  // Layout: the measured area height drives the sheet snap points and the map padding.
  const areaRef = React.useRef<HTMLDivElement>(null);
  const [areaH, setAreaH] = React.useState(0);
  React.useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver((items) => setAreaH(Math.round(items[0]?.contentRect.height ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const visibleSheet = areaH ? areaH - sheetOffsets(areaH, TOP_SPACE)[snap] : 0;
  const padding: MapPadding = { top: TOP_SPACE + 12, right: 36, bottom: Math.min(visibleSheet, Math.round(areaH * 0.62)) + 20, left: 36 };

  const scrollToRow = (id: string) => {
    // Two frames: a "Daha fazla" step for the row has rendered by then.
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const list = listRef.current;
        const el = list?.querySelector<HTMLElement>(`#rehber-${CSS.escape(id)}`);
        if (list && el) list.scrollTo({ top: Math.max(0, el.offsetTop - 8), behavior: "smooth" });
      }),
    );
  };

  const onMarkerSelect = (id: string) => {
    setSelectedId(id);
    const i = filtered.findIndex((e) => e.id === id);
    if (i >= limit) setLimit(Math.ceil((i + 1) / STEP) * STEP);
    if (snap === "full") setSnap("half");
    scrollToRow(id);
  };

  const locate = async () => {
    if (loc.coords) {
      setFly({ ...loc.coords, zoom: 15, nonce: Date.now() });
      return;
    }
    const coords = await loc.request();
    if (coords) toast.success("Konumun bulundu, en yakından uzağa sıralandı.");
    else toast.error("Konum alınamadı. Telefonunun konum iznini kontrol edip tekrar dene.");
  };

  const goBack = () => (canGoBack() ? router.back() : router.push(routes.guide.root()));

  const clearQuery = () => {
    update({ q: "" });
    searchRef.current?.focus();
  };

  const filtersActive = !!filters.chip || !!filters.own || !!filters.ilce || !!filters.q;
  const visible = filtered.slice(0, limit);
  const refDistrict = loc.pointSource === "district" ? districtBySlug(loc.district) : undefined;
  const sortHint = loc.pointSource === "gps" ? "en yakından uzağa" : refDistrict ? `${refDistrict.name} merkezine göre` : "A'dan Z'ye";
  const header = <SheetTitle title={config.title} line={`${filtered.length} kayıt · ${sortHint}`} />;

  // Sheet toolbar (stays above the scrolling rows): ATM / Şube, the chips, then the search.
  const toolbar =
    config.bankSwitch || chipOptions.length || entries.length ? (
      <div className="flex flex-col gap-3">
        {config.bankSwitch ? <BankSwitch current={config.kind} counts={bankCounts} /> : null}
        {chipOptions.length ? (
          <ChipFilter
            options={chipOptions}
            value={filters.chip ?? ALL}
            onChange={(v) => {
              update({ chip: !v || v === ALL ? null : v });
              listRef.current?.scrollTo({ top: 0 });
            }}
            ariaLabel="Alt kategori"
            size="sm"
            centerSelected
            className="py-0"
          />
        ) : null}
        {entries.length ? (
          <div role="search" className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={filters.q}
              onChange={(e) => update({ q: e.target.value.slice(0, 80) })}
              onFocus={() => {
                if (snap === "peek") setSnap("half");
              }}
              placeholder="İsim ya da adres ara"
              aria-label={`${config.title} içinde ara`}
              enterKeyHint="search"
              autoComplete="off"
              className="h-11 w-full rounded-full bg-card pr-11 pl-12 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
            />
            {filters.q ? (
              <button
                type="button"
                onClick={clearQuery}
                aria-label="Aramayı temizle"
                className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    ) : null;

  const content = (
    <>
      {hasBothOwnerships ? (
        <div className="mb-3">
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
        </div>
      ) : null}

      {!ok && entries.length ? (
        <p className="mb-3 rounded-2xl bg-highlight-soft px-4 py-3 text-xs font-medium text-highlight-foreground dark:text-highlight">
          Listenin bir kısmı yüklenemedi. Sayfayı yenileyip tekrar dene.
        </p>
      ) : null}

      {!entries.length ? (
        ok ? (
          <EmptyState
            compact
            icon={KIND_META[config.kind].icon}
            title="Bu kategoride henüz kayıt yok"
            description="Rehberdeki diğer kategorilere göz atabilirsin."
            actionLabel="Rehbere dön"
            actionHref={routes.guide.root()}
          />
        ) : (
          <ErrorState compact description="Liste şu an yüklenemedi. Biraz sonra tekrar dene." />
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
              <Button type="button" variant="secondary" className="rounded-full" onClick={() => update({ chip: null, own: null, q: "", ilce: null })}>
                Filtreleri temizle
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <EntryRows entries={visible} title={config.title} selectedId={selectedId} />
          {filtered.length > visible.length ? (
            <Button type="button" variant="secondary" size="lg" className="mt-3 w-full rounded-full" onClick={() => setLimit((n) => n + STEP)}>
              Daha fazla göster ({filtered.length - visible.length})
            </Button>
          ) : null}
        </>
      )}

      {filtered.length > 0 && pinned.length === 0 ? (
        <p className={cn(NOTE, "flex items-start gap-2")}>
          <MapPinOff className="mt-px size-3.5 shrink-0" aria-hidden />
          Bu kayıtların harita konumu henüz yok.
        </p>
      ) : missing > 0 ? (
        <p className={NOTE}>{missing} kaydın harita konumu henüz yok; onları yalnızca listede görürsün.</p>
      ) : null}
      {pinned.length > MAX_PINS ? (
        <p className={NOTE}>
          Haritada en yakın {MAX_PINS} kayıt gösteriliyor. Daraltmak için ara ya da bir filtre seç.
        </p>
      ) : null}
      {entries.length ? <DataSourceNote className="mt-3" {...sourceFor(config.kind)} /> : null}
    </>
  );

  return (
    <div ref={areaRef} className={NEARBY_AREA_CLASS}>
      {/* Map-first screen: the map loads with the page. */}
      <div className="absolute inset-0">
        {anyPins ? (
          <GoogleMap
            points={points}
            user={loc.coords}
            center={loc.point}
            zoom={byDistance ? 13 : 11}
            selectedId={selectedId}
            onSelect={onMarkerSelect}
            fitKey={fitKey}
            fitCount={byDistance ? FIT_NEAREST : undefined}
            padding={padding}
            flyTo={fly}
            gestures="greedy"
            showZoomButtons
            controlsTop={TOP_SPACE}
            className="h-full w-full"
            ariaLabel={`${config.title} haritası`}
          />
        ) : (
          <MapPattern className="h-full w-full" />
        )}
      </div>

      {/* Only the back button on the map; the filters live in the sheet. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-4 pt-2.5">
        <button type="button" onClick={goBack} aria-label="Geri" className={BACK_BUTTON}>
          <ArrowLeft className="size-5" strokeWidth={2.2} aria-hidden />
        </button>
      </div>

      {areaH > 0 ? (
        <NearbySheet
          snap={snap}
          onSnapChange={setSnap}
          height={areaH}
          topInset={TOP_SPACE}
          listRef={listRef}
          floating={
            anyPins ? (
              <button
                type="button"
                onClick={locate}
                disabled={loc.status === "locating"}
                aria-label={loc.coords ? "Konumuma git" : "Konumumu bul"}
                className="pointer-events-auto ml-auto flex size-12 items-center justify-center rounded-full bg-card text-primary transition-transform outline-none active:scale-95 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-80 motion-reduce:transition-none"
              >
                {loc.status === "locating" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <LocateFixed className="size-5" aria-hidden />}
              </button>
            ) : null
          }
          header={header}
          toolbar={toolbar}
        >
          {content}
        </NearbySheet>
      ) : (
        <StaticSheet header={header}>{content}</StaticSheet>
      )}
    </div>
  );
}

/** The browser with the URL's filters (wrap in <Suspense> whose fallback is <GuideListFallback>). */
export function GuideListBrowserFromUrl(props: GuideListBrowserProps) {
  const params = useSearchParams();
  return <GuideListBrowser {...props} params={params} />;
}
