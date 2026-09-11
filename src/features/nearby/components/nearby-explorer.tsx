"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, Loader2, LocateFixed } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isDutyActive } from "@/core/duty";
import { routes } from "@/core/routes";
import { istanbulParts } from "@/core/time";
import { ChipFilter, type ChipOption } from "@/components/shared/chip-filter";
import { DataSourceNote } from "@/components/shared/data-source-note";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { NeighbourhoodPicker } from "@/components/shared/neighbourhood-picker";
import { ListSkeleton } from "@/components/shared/skeletons";
import { useApproxLocation } from "@/lib/location/use-approx-location";
import { useOnboardingActive } from "@/features/onboarding";
import { CITY } from "@/config/site";
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
import { MapAttribution } from "../map/attribution";
import { LazyNearbyMap } from "../map/lazy-map";
import type { FlyRequest, MapPadding, MapPoint } from "../map/types";
import { useNearbyData } from "../lib/use-nearby-data";
import { useNow } from "../lib/use-now";
import type { NearbyFilter, NearbyItem } from "../types";
import { CoachMarks, type CoachStep } from "./coach-marks";
import { DutyUnverified } from "./duty-unverified";
import { LocationPrompt } from "./location-prompt";
import { NearbyCard } from "./nearby-card";
import { NEARBY_AREA_CLASS } from "./nearby-explorer-skeleton";
import { NearbySheet, sheetOffsets, type SheetSnap } from "./nearby-sheet";

const COACH_KEY = "gebzem.coach.yakinimda.v1";
/** Space kept for the chip row at the top of the map. */
const CHIPS_SPACE = 64;

/** "Nöbetçi" is preselected between 19:00 and 08:30 (Istanbul). */
function defaultFilterFor(now: number): NearbyFilter {
  const p = istanbulParts(now);
  const minutes = p.hour * 60 + p.minute;
  return minutes >= 19 * 60 || minutes < 8 * 60 + 30 ? "nobetci" : "eczane";
}

const CHIP_OPTIONS: ChipOption<NearbyFilter>[] = NEARBY_FILTERS.map((f) => ({ value: f.value, label: f.label, icon: f.icon }));

function sourceFor(filter: NearbyFilter): { source: string; sourceUrl?: string; callAhead?: boolean; note?: React.ReactNode } {
  switch (filter) {
    case "nobetci":
      return {
        source: "Nöbet listesi",
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
      return { source: OSM_SOURCE, sourceUrl: OSM_COPYRIGHT_URL, callAhead: true };
    case "gezilecek":
      return { source: `${KBB_SOURCE}, ${OSM_SOURCE}` };
    case "isletme":
      return { source: "Gebzem onaylı işletmeleri", note: "Yalnızca haritada konumu olan işletmeler gösterilir." };
  }
}

/** D1: map + draggable list of nearby places with filter chips. */
export function NearbyExplorer() {
  const searchParams = useSearchParams();
  const now = useNow();
  const loc = useApproxLocation();
  const onboardingActive = useOnboardingActive();

  const [chosen, setChosen] = React.useState<NearbyFilter | null>(() => parseFilter(searchParams.get("tur")));
  const filter: NearbyFilter | null = chosen ?? (now ? defaultFilterFor(now) : null);
  const meta = filterMeta(filter ?? "eczane");
  const data = useNearbyData(filter, loc.point);
  const showDistance = loc.pointSource !== "city";

  const dutyNow = filter === "nobetci" ? now : 0;
  const items = React.useMemo<NearbyItem[]>(
    () => (filter === "nobetci" ? data.items.filter((i) => !!i.duty && isDutyActive(i.duty.start, i.duty.end, dutyNow)) : data.items),
    [data.items, filter, dutyNow],
  );
  const points = React.useMemo<MapPoint[]>(() => items.map((i) => ({ id: i.id, lat: i.lat, lng: i.lng, kind: i.kind, label: i.name })), [items]);

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
      toast.error("Konum alınamadı. Mahalleni seçebilirsin.");
      setPickerOpen(true);
    }
  };

  const fitKey = !data.loading && items.length > 0 ? data.cacheKey : "";
  const sortHint =
    loc.pointSource === "gps" ? "en yakından uzağa" : loc.pointSource === "neighbourhood" && loc.neighbourhood ? `${loc.neighbourhood.name} merkezine göre` : `${CITY.name} merkezine göre`;
  const source = filter ? sourceFor(filter) : null;

  const coachSteps: CoachStep[] = [
    { targetRef: chipsRef, text: "Ne arıyorsan seç: nöbetçi eczane, cami, durak, işletme…", placement: "bottom" },
    { targetRef: locateRef, text: "Haritada kaybolursan buraya dokun", placement: "top" },
    { targetRef: handleRef, text: "Listeyi yukarı çek, en yakından uzağa sıralı gör", placement: "top" },
  ];

  return (
    <div ref={areaRef} className={NEARBY_AREA_CLASS}>
      <div className="absolute inset-0">
        <LazyNearbyMap
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
          showControls
          controlsTop={CHIPS_SPACE}
          showAttribution={false}
          className="h-full w-full"
          ariaLabel={`${meta.title} haritası`}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-background/95 via-background/70 to-transparent px-4 pt-2.5 pb-5">
        <div ref={chipsRef} className="pointer-events-auto">
          <ChipFilter options={CHIP_OPTIONS} value={filter} onChange={onFilterChange} ariaLabel="Ne arıyorsun?" />
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
              <MapAttribution className="mb-1" />
              <button
                ref={locateRef}
                type="button"
                onClick={locate}
                disabled={loc.status === "locating"}
                aria-label={loc.coords ? "Konumuma git" : "Konumumu bul"}
                className="pointer-events-auto flex size-12 items-center justify-center rounded-full bg-background text-primary shadow-card ring-1 ring-foreground/[0.08] transition-transform outline-none active:scale-95 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-80"
              >
                {loc.status === "locating" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <LocateFixed className="size-5" aria-hidden />}
              </button>
            </>
          }
          header={
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-lg leading-tight font-bold">{meta.title}</h2>
                <p className="mt-0.5 truncate text-xs text-muted-foreground" aria-live="polite">
                  {data.loading ? "Yükleniyor…" : `${items.length} ${meta.noun}`} · {sortHint}
                </p>
              </div>
            </div>
          }
        >
          <LocationPrompt loc={loc} onLocate={locate} onPickNeighbourhood={() => setPickerOpen(true)} className="mb-3" />

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
                description={filter === "isletme" ? "Haritada konumu olan onaylı işletme henüz yok." : "Farklı bir mahalle seçmeyi ya da konumunu paylaşmayı dene."}
              />
            )
          ) : (
            <ul className="flex flex-col gap-3" aria-label={meta.title}>
              {items.map((item) => (
                <li key={item.id}>
                  <NearbyCard item={item} now={now} showDistance={showDistance} selected={item.id === selectedId} onShowOnMap={showOnMap} />
                </li>
              ))}
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

      <NeighbourhoodPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        showTrigger={false}
        showUseLocation
        value={loc.neighbourhood?.id ?? null}
        title="Mahalleni seç"
      />

      <CoachMarks
        steps={coachSteps}
        storageKey={COACH_KEY}
        enabled={!!filter && !data.loading && areaH > 0 && !pickerOpen && !onboardingActive}
      />
    </div>
  );
}
