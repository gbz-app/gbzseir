"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, Loader2, LocateFixed, Search, SearchX, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isDutyActive } from "@/core/duty";
import { routes } from "@/core/routes";
import { istanbulParts } from "@/core/time";
import { trNormalize } from "@/core/tr";
import { Button } from "@/components/ui/button";
import { ChipFilter, type ChipOption } from "@/components/shared/chip-filter";
import { DataSourceNote } from "@/components/shared/data-source-note";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { DistrictPicker } from "@/components/shared/district-picker";
import { ListSkeleton } from "@/components/shared/skeletons";
import { GoogleMap } from "@/components/maps/google-map";
import type { FlyRequest, MapPadding, MapPoint } from "@/components/maps/types";
import { useApproxLocation } from "@/lib/location/use-approx-location";
import { useOnboardingActive } from "@/features/onboarding";
import {
  ECZACI_ODASI_NAME,
  ECZACI_ODASI_URL,
  KBB_SOURCE,
  NEARBY_FILTERS,
  OSM_COPYRIGHT_URL,
  OSM_SOURCE,
  filterMeta,
  nearbyFilterHref,
  parseFilter,
} from "../config";
import { HEPSI_GROUPS, useNearbyData } from "../lib/use-nearby-data";
import { useNow } from "../lib/use-now";
import type { DutyMode, NearbyFilter, NearbyItem } from "../types";
import { CoachMarks, type CoachStep } from "./coach-marks";
import { DutyDemoNote } from "./duty-card";
import { DutyUnverified } from "./duty-unverified";
import { LocationPrompt } from "./location-prompt";
import { NearbyCard } from "./nearby-card";
import { NEARBY_AREA_CLASS } from "./nearby-explorer-skeleton";
import { NearbySheet, sheetOffsets, type SheetSnap } from "./nearby-sheet";

const COACH_KEY = "gebzem.coach.yakinimda.v1";
/** Space kept for the chip row at the top of the map. */
const CHIPS_SPACE = 64;
/** "Tümü": cards shown per kind before its "Tümü" link. */
const PER_GROUP = 3;

/** "Nöbetçi" is preselected between 19:00 and 08:30 (Istanbul), but only when the duty list is real ("live"). */
function defaultFilterFor(now: number, dutyMode: DutyMode): NearbyFilter {
  if (dutyMode !== "live") return "eczane";
  const p = istanbulParts(now);
  const minutes = p.hour * 60 + p.minute;
  return minutes >= 19 * 60 || minutes < 8 * 60 + 30 ? "nobetci" : "eczane";
}

/** No "Nöbetçi" chip: it is the second option of the Eczane tab (PharmacySwitch in the list). "Tümü" leads the row. */
const CHIP_OPTIONS: ChipOption<NearbyFilter>[] = NEARBY_FILTERS.filter((f) => f.value !== "nobetci").map((f) => ({ value: f.value, label: f.label, icon: f.icon }));

/** Tüm eczaneler / Nöbetçi, above the pharmacy list (same look as the guide's ATM / banka switch). */
function PharmacySwitch({ value, onChange }: { value: "eczane" | "nobetci"; onChange: (f: NearbyFilter) => void }) {
  const options = [
    { value: "eczane", label: "Tüm eczaneler" },
    { value: "nobetci", label: "Nöbetçi" },
  ] as const;
  return (
    <div role="radiogroup" aria-label="Eczaneler" className="grid grid-cols-2 rounded-full bg-card p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-9 rounded-full text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              // Nöbetçi picked: solid red like the pins and badges (never yellow); "Tüm eczaneler" stays black.
              on ? (o.value === "nobetci" ? "bg-red-600 text-white dark:bg-red-500" : "bg-foreground text-background") : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function sourceFor(filter: NearbyFilter, dutyMode: DutyMode): { source: string; sourceUrl?: string; callAhead?: boolean; note?: React.ReactNode } {
  switch (filter) {
    case "hepsi":
      return { source: `${KBB_SOURCE}, ${OSM_SOURCE}`, sourceUrl: OSM_COPYRIGHT_URL };
    case "nobetci":
      return {
        source: dutyMode === "demo" ? "Örnek veri (gerçek liste değil)" : "Nöbet listesi",
        callAhead: true,
        note: (
          <>
            Güncel liste için{" "}
            <a href={ECZACI_ODASI_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground underline underline-offset-2">
              {ECZACI_ODASI_NAME}
            </a>
            .
          </>
        ),
      };
    case "eczane":
      return { source: KBB_SOURCE, callAhead: true };
    case "cami":
      return { source: KBB_SOURCE };
    case "durak":
      return { source: OSM_SOURCE, sourceUrl: OSM_COPYRIGHT_URL };
    case "taksi":
      return { source: OSM_SOURCE, sourceUrl: OSM_COPYRIGHT_URL, callAhead: true, note: "Telefonlar herkese açık rehber ve harita kayıtlarından alındı." };
    case "atm":
    case "banka":
    case "akaryakit":
      return { source: OSM_SOURCE, sourceUrl: OSM_COPYRIGHT_URL };
    case "sarj":
      return { source: OSM_SOURCE, sourceUrl: OSM_COPYRIGHT_URL, note: "Soket ve müsaitlik bilgisini operatörün uygulamasından kontrol et." };
    case "kurum":
      return { source: `Resmî kurum siteleri, ${OSM_SOURCE}`, sourceUrl: OSM_COPYRIGHT_URL, callAhead: true, note: "Telefon ve adresler kurum sitelerinden ve harita kayıtlarından derlendi." };
    case "gezilecek":
      return { source: `${KBB_SOURCE}, ${OSM_SOURCE}` };
    case "isletme":
      return { source: "Gebzem onaylı işletmeleri", note: "Yalnızca haritada konumu olan işletmeler gösterilir." };
  }
}

/**
 * D1: map + draggable list of nearby places with filter chips. `dutyMode` (app setting) drives the duty labels and night
 * default. "Tümü" (?tur=hepsi, the home page's Yakınımda "Tümü") puts every kind on the map and groups the list by kind.
 */
export function NearbyExplorer({ dutyMode }: { dutyMode: DutyMode }) {
  const searchParams = useSearchParams();
  const now = useNow();
  const loc = useApproxLocation();
  const onboardingActive = useOnboardingActive();

  const [chosen, setChosen] = React.useState<NearbyFilter | null>(() => parseFilter(searchParams.get("tur")));
  const filter: NearbyFilter | null = chosen ?? (now ? defaultFilterFor(now, dutyMode) : null);
  const meta = filterMeta(filter ?? "eczane");
  const data = useNearbyData(filter, loc.point);
  const showDistance = loc.pointSource !== "city";
  const demoDuty = dutyMode === "demo";

  const dutyNow = filter === "nobetci" ? now : 0;
  const items = React.useMemo<NearbyItem[]>(() => {
    if (filter !== "nobetci") return data.items;
    // "off": no duty list at all (DutyUnverified), whatever a cached answer holds.
    if (dutyMode === "off") return [];
    return data.items.filter((i) => !!i.duty && isDutyActive(i.duty.start, i.duty.end, dutyNow));
  }, [data.items, filter, dutyNow, dutyMode]);
  // In-sheet search over the current tab (name / subtitle / address, Turkish-insensitive). Pins follow it.
  const [query, setQuery] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement>(null);
  const q = trNormalize(query);
  const visible = React.useMemo<NearbyItem[]>(() => {
    if (!q) return items;
    const words = q.split(" ");
    return items.filter((i) => {
      const hay = trNormalize([i.name, i.subtitle, i.address].filter(Boolean).join(" "));
      return words.every((w) => hay.includes(w));
    });
  }, [items, q]);
  const points = React.useMemo<MapPoint[]>(() => visible.map((i) => ({ id: i.id, lat: i.lat, lng: i.lng, kind: i.kind, label: i.name })), [visible]);
  // The map refits to the results once typing pauses (not on every keystroke).
  const [fitQuery, setFitQuery] = React.useState("");
  React.useEffect(() => {
    if (q === fitQuery) return;
    const id = window.setTimeout(() => setFitQuery(q), 450);
    return () => window.clearTimeout(id);
  }, [q, fitQuery]);

  // Layout: measured area height drives the sheet snap points and the map padding.
  const areaRef = React.useRef<HTMLDivElement>(null);
  const [areaH, setAreaH] = React.useState(0);
  React.useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = Math.round(entries[0]?.contentRect.height ?? 0);
      setAreaH(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [snap, setSnap] = React.useState<SheetSnap>("half");
  const visibleSheet = areaH ? areaH - sheetOffsets(areaH, CHIPS_SPACE)[snap] : 0;
  const padding: MapPadding = { top: CHIPS_SPACE + 12, right: 36, bottom: Math.min(visibleSheet, Math.round(areaH * 0.62)) + 20, left: 36 };

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [fly, setFly] = React.useState<FlyRequest | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);
  const chipsRef = React.useRef<HTMLDivElement>(null);
  const locateRef = React.useRef<HTMLButtonElement>(null);
  const handleRef = React.useRef<HTMLButtonElement>(null);

  const scrollToCard = (id: string) => {
    window.requestAnimationFrame(() => {
      const list = listRef.current;
      const el = list?.querySelector<HTMLElement>(`#yakin-${CSS.escape(id)}`);
      if (list && el) list.scrollTo({ top: Math.max(0, el.offsetTop - 8), behavior: "smooth" });
    });
  };

  const onFilterChange = (f: NearbyFilter | null) => {
    if (!f || f === filter) return;
    setChosen(f);
    setSelectedId(null);
    setQuery("");
    setFitQuery("");
    listRef.current?.scrollTo({ top: 0 });
    window.history.replaceState(null, "", nearbyFilterHref(f));
  };

  const onMarkerSelect = (id: string) => {
    setSelectedId(id);
    if (snap === "full") setSnap("half");
    scrollToCard(id);
  };

  const showOnMap = (item: NearbyItem) => {
    setSelectedId(item.id);
    setSnap("peek");
    setFly({ lat: item.lat, lng: item.lng, zoom: 16, nonce: Date.now() });
    scrollToCard(item.id);
  };

  const locate = async () => {
    if (loc.coords) {
      setFly({ ...loc.coords, zoom: 15, nonce: Date.now() });
      return;
    }
    const coords = await loc.request();
    if (coords) toast.success("Konumun bulundu, en yakından uzağa sıralandı.");
    else {
      toast.error("Konum alınamadı. İlçeni seçebilirsin.");
      setPickerOpen(true);
    }
  };

  const clearQuery = () => {
    setQuery("");
    searchRef.current?.focus();
  };

  const fitKey = !data.loading && visible.length > 0 ? `${data.cacheKey}|${fitQuery}` : "";
  const source = filter ? sourceFor(filter, dutyMode) : null;

  const coachSteps: CoachStep[] = [
    { targetRef: chipsRef, text: "Ne arıyorsan seç: nöbetçi eczane, cami, durak, ATM…", placement: "bottom" },
    { targetRef: locateRef, text: "Haritada kaybolursan buraya dokun", placement: "top" },
    { targetRef: handleRef, text: "Listeyi yukarı çek, en yakından uzağa sıralı gör", placement: "top" },
  ];

  const card = (item: NearbyItem) => (
    <li key={item.id}>
      <NearbyCard item={item} now={now} showDistance={showDistance} selected={item.id === selectedId} demoDuty={demoDuty} onShowOnMap={showOnMap} />
    </li>
  );

  return (
    <div ref={areaRef} className={NEARBY_AREA_CLASS}>
      {/* Map-first screen: the map loads with the page (no "Haritayı göster" step). */}
      <div className="absolute inset-0">
        <GoogleMap
          points={points}
          user={loc.coords}
          center={loc.point}
          zoom={loc.pointSource === "city" ? 12 : 14}
          selectedId={selectedId}
          onSelect={onMarkerSelect}
          fitKey={fitKey}
          fitCount={showDistance ? 8 : undefined}
          padding={padding}
          flyTo={fly}
          gestures="greedy"
          showZoomButtons
          controlsTop={CHIPS_SPACE}
          className="h-full w-full"
          ariaLabel={`${meta.title} haritası`}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-background/95 via-background/70 to-transparent px-4 pt-2.5 pb-5">
        <div ref={chipsRef} className="pointer-events-auto">
          {/* Nöbetçi is part of the Eczane tab: its chip stays on while the switch below picks the list. */}
          <ChipFilter options={CHIP_OPTIONS} value={filter === "nobetci" ? "eczane" : filter} onChange={onFilterChange} ariaLabel="Ne arıyorsun?" centerSelected />
        </div>
      </div>

      {areaH > 0 && filter ? (
        <NearbySheet
          snap={snap}
          onSnapChange={setSnap}
          height={areaH}
          topInset={CHIPS_SPACE}
          handleRef={handleRef}
          listRef={listRef}
          floating={
            <>
              <button
                ref={locateRef}
                type="button"
                onClick={locate}
                disabled={loc.status === "locating"}
                aria-label={loc.coords ? "Konumuma git" : "Konumumu bul"}
                className="pointer-events-auto ml-auto flex size-12 items-center justify-center rounded-full bg-card text-primary transition-transform outline-none active:scale-95 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-80 motion-reduce:transition-none"
              >
                {loc.status === "locating" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <LocateFixed className="size-5" aria-hidden />}
              </button>
            </>
          }
          header={
            // Same on every tab (the taxi layout): the title on the left, the count in the right corner.
            <div className="flex items-center justify-between gap-3">
              <h2 className="min-w-0 truncate text-xl leading-tight font-bold">{meta.title}</h2>
              <p className="shrink-0 text-sm font-semibold text-muted-foreground tabular-nums" aria-live="polite">
                {data.loading ? "Yükleniyor…" : `${visible.length} ${meta.noun}`}
              </p>
            </div>
          }
          toolbar={
            // Eczane tab: the Tüm eczaneler / Nöbetçi switch (also while loading or empty), then the search.
            filter === "eczane" || filter === "nobetci" || (!data.loading && !data.error && items.length > 0) ? (
              <div className="flex flex-col gap-3">
                {filter === "eczane" || filter === "nobetci" ? <PharmacySwitch value={filter} onChange={onFilterChange} /> : null}
                {!data.loading && !data.error && items.length > 0 ? (
                  <div role="search" className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <input
                      ref={searchRef}
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onFocus={() => {
                        if (snap === "peek") setSnap("half");
                      }}
                      placeholder="Ara"
                      aria-label={`${meta.title} içinde ara`}
                      enterKeyHint="search"
                      autoComplete="off"
                      className="h-11 w-full rounded-full bg-card pr-11 pl-12 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
                    />
                    {query ? (
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
            ) : null
          }
        >
          {/* Hidden while searching so the matches start right under the search bar. */}
          {query.trim() ? null : <LocationPrompt loc={loc} onLocate={locate} onPickDistrict={() => setPickerOpen(true)} className="mb-3" />}
          {filter === "nobetci" && demoDuty && !query.trim() && !data.loading && !data.error && items.length > 0 ? <DutyDemoNote className="mb-3" /> : null}

          {data.loading ? (
            <ListSkeleton count={3} variant="card" />
          ) : data.error ? (
            <ErrorState compact description={data.error} onRetry={data.retry} />
          ) : items.length === 0 ? (
            filter === "nobetci" ? (
              <DutyUnverified />
            ) : (
              <EmptyState
                compact
                icon={meta.icon}
                title="Yakında sonuç bulunamadı"
                description={filter === "isletme" ? "Haritada konumu olan onaylı işletme henüz yok." : "Farklı bir ilçe seçmeyi ya da konumunu paylaşmayı dene."}
              />
            )
          ) : visible.length === 0 ? (
            <EmptyState
              compact
              icon={SearchX}
              tone="default"
              title="Sonuç bulunamadı"
              description={`"${query.trim()}" için ${meta.noun} bulamadık. Farklı bir kelime dene.`}
              action={
                <Button type="button" variant="secondary" className="rounded-full" onClick={clearQuery}>
                  Aramayı temizle
                </Button>
              }
            />
          ) : filter === "hepsi" ? (
            // Every kind nearby, grouped: the nearest few of each, then "Tümü" opens that tab.
            <div className="flex flex-col gap-5">
              {HEPSI_GROUPS.map((g) => {
                const list = visible.filter((i) => i.kind === g.kind);
                if (!list.length) return null;
                const gm = filterMeta(g.filter);
                return (
                  <section key={g.filter} aria-label={gm.title}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h3 className="min-w-0 truncate text-[17px] font-semibold">
                        {gm.title} <span className="font-medium text-muted-foreground tabular-nums">{list.length}</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => onFilterChange(g.filter)}
                        className="inline-flex min-h-9 shrink-0 items-center gap-0.5 rounded-full text-sm font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        Tümü <ChevronRight className="size-4" aria-hidden />
                      </button>
                    </div>
                    <ul className="flex flex-col gap-3">{list.slice(0, PER_GROUP).map(card)}</ul>
                  </section>
                );
              })}
            </div>
          ) : (
            <ul className="flex flex-col gap-3" aria-label={meta.title}>
              {visible.map(card)}
            </ul>
          )}

          {filter === "nobetci" || filter === "gezilecek" ? (
            <Link
              href={filter === "nobetci" ? routes.nearby.dutyPharmacies() : routes.nearby.places()}
              className="mt-3 flex min-h-12 items-center justify-between gap-2 rounded-2xl bg-muted/70 px-4 text-sm font-semibold text-primary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {filter === "nobetci" ? "Tüm nöbetçi eczaneler ve yarının listesi" : "Tüm gezilecek yerler"}
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : null}
          {source ? <DataSourceNote className={cn("mt-3")} {...source} /> : null}
        </NearbySheet>
      ) : null}

      {/* The pick becomes the reference point (district centre) of every nearby list. */}
      <DistrictPicker open={pickerOpen} onOpenChange={setPickerOpen} showTrigger={false} showUseLocation persistDefault value={loc.district} />

      <CoachMarks
        steps={coachSteps}
        storageKey={COACH_KEY}
        enabled={!!filter && !data.loading && areaH > 0 && !pickerOpen && !onboardingActive}
      />
    </div>
  );
}
