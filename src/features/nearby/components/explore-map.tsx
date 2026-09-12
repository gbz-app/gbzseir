"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronRight, Loader2, LocateFixed, MapPinOff, SearchX } from "lucide-react";
import { toast } from "sonner";
import { isDutyActive } from "@/core/duty";
import { distanceMeters } from "@/core/geo";
import { routes } from "@/core/routes";
import { istanbulParts } from "@/core/time";
import { trNormalize } from "@/core/tr";
import { canGoBack } from "@/lib/navigation-history";
import { cn } from "@/lib/utils";
import { useApproxLocation } from "@/lib/location/use-approx-location";
import { Button } from "@/components/ui/button";
import { DataSourceNote } from "@/components/shared/data-source-note";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { ListSkeleton } from "@/components/shared/skeletons";
import { GoogleMap } from "@/components/maps/google-map";
import type { FlyRequest, MapPadding, MapPoint } from "@/components/maps/types";
import { useOnboardingActive } from "@/features/onboarding";
import type { InstitutionCategoryDef, Ownership } from "@/features/guide/lib/types";
import { entryDimValue } from "@/features/guide/components/list-config";
import { filterMeta } from "../config";
import {
  BANK_NODES,
  DEFAULT_NODE,
  clearLevel,
  drillInto,
  drillRow,
  exploreHref,
  nodeById,
  nodeForNearbyFilter,
  parseExploreUrl,
  settleChip,
  swapBankNode,
  toggleChip,
  type DrillDataset,
  type ExploreSel,
} from "../explore-tree";
import { entryToItem, hasPin, type PinnedEntry } from "../lib/guide-items";
import { useGuideDataset, type GuideDatasetSeed } from "../lib/use-guide-dataset";
import { HEPSI_GROUPS, useNearbyData } from "../lib/use-nearby-data";
import { useNow } from "../lib/use-now";
import type { DutyMode, NearbyFilter, NearbyItem } from "../types";
import { CoachMarks, type CoachStep } from "./coach-marks";
import { DrillChips } from "./drill-chips";
import { DutyUnverified } from "./duty-unverified";
import { BankSwitch, PharmacySwitch, Segmented, SheetSearch, guideSource, nearbySource } from "./explore-parts";
import { LocationPrompt } from "./location-prompt";
import { NearbyCard } from "./nearby-card";
import { NEARBY_AREA_CLASS } from "./nearby-explorer-skeleton";
import { NearbySheet, sheetOffsets, type SheetSnap } from "./nearby-sheet";

const COACH_KEY = "gebzem.coach.yakinimda.v1";
/** Space kept at the top of the map: the back button (Şehir Rehberi door) and the zoom buttons; the full sheet stops there. */
const TOP_SPACE = 64;
/** "Yakınımdakiler": the nearest card of each kind, then its "Tümü" link. */
const PER_GROUP = 1;
/** Guide lists show this many cards at a time ("Daha fazla göster"). */
const STEP = 40;
/** Pins drawn at most for a guide list (the nearest ones); the list keeps every row. */
const MAX_PINS = 400;
/** With a known location the first view fits the nearest N pins. */
const FIT_NEAREST = 8;

const NOTE = "mt-3 rounded-2xl bg-muted/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground";
const ROUND_BUTTON =
  "pointer-events-auto flex items-center justify-center rounded-full bg-card outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 motion-reduce:transition-none";

/** "Nöbetçi" is preselected between 19:00 and 08:30 (Istanbul), but only when the duty list is real ("live"). */
function nightDuty(now: number, dutyMode: DutyMode): boolean {
  if (dutyMode !== "live") return false;
  const p = istanbulParts(now);
  const minutes = p.hour * 60 + p.minute;
  return minutes >= 19 * 60 || minutes < 8 * 60 + 30;
}

export type ExploreMapProps = {
  dutyMode: DutyMode;
  /** The server's institution categories: the URL is read with the same list the page resolved /rehber/<slug> with. */
  defs: readonly InstitutionCategoryDef[];
  /** /rehber/[kategori]: the list the page rendered (not fetched again). */
  seed?: GuideDatasetSeed | null;
  /** The Şehir Rehberi door: a back button on the map, going here when there is no history. */
  backHref?: string;
};

/**
 * The one explore screen (owner 12.09: Keşfet and the Şehir Rehberi lists are the same map): one Google map for the
 * screen's life, only its pins change. The list sheet holds everything else: the title and count, the chip row
 * (DrillChips: kinds, then Kurum -> Belediye ve kamu -> Kaymakamlık, ATM -> banks, each chosen level black with an X),
 * the Nöbetçi or ATM / Şube switch, the search, then the cards. Eczane, Cami, Durak, Taksi, Gezilecek and
 * Yakınımdakiler are the nearest rows around the user (useNearbyData); ATM, Banka, Akaryakıt, Şarj, Kurum and every
 * guide list are whole lists (useGuideDataset), nearest first once a location is known, else A-Z. The selection is
 * read from the URL once (old ?tur= links too) and mirrored back with history.replaceState after the first change.
 */
export function ExploreMap({ dutyMode, defs, seed = null, backHref }: ExploreMapProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const now = useNow();
  const loc = useApproxLocation();
  const onboardingActive = useOnboardingActive();

  // What the URL chose; without a choice the screen opens Eczane, with Nöbetçi at night, until the first tap.
  const [init] = React.useState(() => parseExploreUrl(pathname, searchParams, defs));
  const [sel, setSel] = React.useState<ExploreSel>(init.sel);
  const [touched, setTouched] = React.useState(false);
  const autoPick = !touched && !init.explicit;
  const ready = !autoPick || !!now;
  const picked: ExploreSel = autoPick && now ? { ...sel, duty: nightDuty(now, dutyMode) } : sel;

  const node = nodeById(picked.node) ?? nodeById(DEFAULT_NODE)!;
  const isGuide = node.source.type === "guide";
  const nearbyFilter: NearbyFilter | null =
    ready && node.source.type === "nearby" ? (node.id === "eczane" && picked.duty ? "nobetci" : node.source.filter) : null;
  const guideSlug = node.source.type === "guide" ? node.source.slug : null;
  const nearby = useNearbyData(nearbyFilter, loc.point);
  const guide = useGuideDataset(guideSlug, seed);
  const dataset = guideSlug && guide.data?.config.slug === guideSlug ? guide.data : null;
  // A chip the loaded list does not have falls back to the path's preset, else to none.
  const shown = dataset ? settleChip(picked, picked.node === init.sel.node ? init.presetChip : null, dataset) : picked;

  // ---- Guide list: Devlet / Özel, the search and the chip, then nearest first (or the server's A-Z order).
  const cfg = dataset?.config ?? null;
  const dim = cfg?.chip ?? null;
  const q = trNormalize(shown.q);
  const words = React.useMemo(() => q.split(" ").filter(Boolean), [q]);
  const entries = dataset?.entries;
  const pre = React.useMemo(
    () =>
      (entries ?? []).filter(
        (e) => (!shown.own || e.own === shown.own) && (!shown.ilce || e.district === shown.ilce) && words.every((w) => e.q.includes(w)),
      ),
    [entries, shown.own, shown.ilce, words],
  );
  const chipCounts = React.useMemo(() => {
    if (!dim) return undefined;
    const counts: Record<string, number> = {};
    for (const e of pre) {
      const v = entryDimValue(e, dim);
      if (v) counts[v] = (counts[v] ?? 0) + 1;
    }
    return counts;
  }, [pre, dim]);
  const drillData: DrillDataset | null = dataset ? { chips: dataset.chips, counts: chipCounts } : null;
  const row = drillRow(shown, drillData);

  const byDistance = loc.pointSource !== "city";
  const { lat: refLat, lng: refLng } = loc.point;
  const guideRows = React.useMemo(() => {
    const list = dim && shown.chip ? pre.filter((e) => entryDimValue(e, dim) === shown.chip) : pre;
    if (!byDistance) return list;
    const ref = { lat: refLat, lng: refLng };
    return list
      .map((e) => ({ e, d: hasPin(e) ? distanceMeters(ref, { lat: e.lat, lng: e.lng }) : Infinity }))
      .sort((a, b) => a.d - b.d)
      .map((x) => x.e);
  }, [pre, dim, shown.chip, byDistance, refLat, refLng]);
  const guidePins = React.useMemo<PinnedEntry[]>(() => {
    const ref = { lat: refLat, lng: refLng };
    return guideRows
      .filter(hasPin)
      .map((e) => ({ e, d: distanceMeters(ref, { lat: e.lat, lng: e.lng }) }))
      .sort((a, b) => a.d - b.d)
      .map((x) => x.e);
  }, [guideRows, refLat, refLng]);
  const hasBothOwnerships = React.useMemo(
    () => !!cfg?.ownership && !!entries?.some((e) => e.own === "devlet") && !!entries?.some((e) => e.own === "ozel"),
    [cfg?.ownership, entries],
  );

  // ---- Nearby list: the nearest rows around the reference point, Nöbetçi only while on duty, then the search.
  const dutyNow = nearbyFilter === "nobetci" ? now : 0;
  const nearbyItems = React.useMemo<NearbyItem[]>(() => {
    if (nearbyFilter !== "nobetci") return nearby.items;
    // "off": no duty list at all (DutyUnverified), whatever a cached answer holds.
    if (dutyMode === "off") return [];
    return nearby.items.filter((i) => !!i.duty && isDutyActive(i.duty.start, i.duty.end, dutyNow));
  }, [nearby.items, nearbyFilter, dutyNow, dutyMode]);
  const nearbyVisible = React.useMemo<NearbyItem[]>(() => {
    if (!words.length) return nearbyItems;
    return nearbyItems.filter((i) => {
      const hay = trNormalize([i.name, i.subtitle, i.address].filter(Boolean).join(" "));
      return words.every((w) => hay.includes(w));
    });
  }, [nearbyItems, words]);

  // ---- One list for the sheet.
  const [limit, setLimit] = React.useState(STEP);
  const loading = isGuide ? guide.loading : nearby.loading || !ready;
  const error = isGuide ? (dataset ? null : guide.error) : nearby.error;
  const retry = isGuide ? guide.retry : nearby.retry;
  /** Rows before the search and the chip (the empty state tells "nothing here" from "nothing matches"). */
  const total = isGuide ? (entries?.length ?? 0) : nearbyItems.length;
  const count = isGuide ? guideRows.length : nearbyVisible.length;
  const cards = React.useMemo<NearbyItem[]>(() => {
    if (!isGuide) return nearbyVisible;
    const ref = byDistance ? { lat: refLat, lng: refLng } : null;
    return guideRows.slice(0, limit).map((e) => entryToItem(e, ref));
  }, [isGuide, nearbyVisible, guideRows, limit, byDistance, refLat, refLng]);
  const points = React.useMemo<MapPoint[]>(
    () =>
      isGuide
        ? guidePins.slice(0, MAX_PINS).map((e) => ({ id: e.id, lat: e.lat, lng: e.lng, kind: e.kind, label: e.name }))
        : nearbyVisible.map((i) => ({ id: i.id, lat: i.lat, lng: i.lng, kind: i.kind, label: i.name })),
    [isGuide, guidePins, nearbyVisible],
  );

  // The map refits to the results once typing pauses (not on every keystroke).
  const [fitQuery, setFitQuery] = React.useState(q);
  React.useEffect(() => {
    if (q === fitQuery) return;
    const id = window.setTimeout(() => setFitQuery(q), 450);
    return () => window.clearTimeout(id);
  }, [q, fitQuery]);
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
  const [snap, setSnap] = React.useState<SheetSnap>("half");
  const visibleSheet = areaH ? areaH - sheetOffsets(areaH, TOP_SPACE)[snap] : 0;
  const padding: MapPadding = { top: TOP_SPACE + 12, right: 36, bottom: Math.min(visibleSheet, Math.round(areaH * 0.62)) + 20, left: 36 };

  // Fit only once the area is measured: a list the page handed over is there on the first render, before the sheet's
  // height is known, and a fit then would hide the pins behind the sheet.
  const fitKey =
    loading || !points.length || !areaH
      ? ""
      : isGuide
        ? `${node.id}|${shown.chip}|${shown.own}|${shown.ilce}|${fitQuery}|${byDistance ? `${refLat.toFixed(3)},${refLng.toFixed(3)}` : "az"}`
        : `${nearby.cacheKey}|${fitQuery}`;

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [fly, setFly] = React.useState<FlyRequest | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const chipsRef = React.useRef<HTMLDivElement>(null);
  const locateRef = React.useRef<HTMLButtonElement>(null);
  const handleRef = React.useRef<HTMLButtonElement>(null);

  // Mirror the selection into the URL once the user changed something (not on open).
  const href = exploreHref(shown, drillData, "query", { pathname, defs });
  React.useEffect(() => {
    if (touched) window.history.replaceState(null, "", href);
  }, [href, touched]);

  const change = (next: ExploreSel) => {
    if (next === shown) return;
    const moved = next.node !== shown.node || next.duty !== shown.duty;
    setTouched(true);
    setSel(next);
    setLimit(STEP);
    setSelectedId(null);
    if (moved) {
      setFitQuery("");
      listRef.current?.scrollTo({ top: 0 });
    }
  };
  const open = (nodeId: string) => {
    if (nodeId !== shown.node) change(drillInto(shown, nodeId));
  };

  const scrollToCard = (id: string) => {
    // Two frames: a "Daha fazla" step for the card has rendered by then.
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const list = listRef.current;
        const el = list?.querySelector<HTMLElement>(`#yakin-${CSS.escape(id)}`);
        if (list && el) list.scrollTo({ top: Math.max(0, el.offsetTop - 8), behavior: "smooth" });
      }),
    );
  };

  const onMarkerSelect = (id: string) => {
    setSelectedId(id);
    if (isGuide) {
      const i = guideRows.findIndex((e) => e.id === id);
      if (i >= limit) setLimit(Math.ceil((i + 1) / STEP) * STEP);
    }
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
    else toast.error("Konum alınamadı. Telefonunun konum iznini kontrol edip tekrar dene.");
  };

  const meta = filterMeta(nearbyFilter ?? node.tur ?? "eczane");
  const title = isGuide ? (cfg?.title ?? node.title) : meta.title;
  const noun = isGuide ? "kayıt" : meta.noun;
  const bankKind = node.id === BANK_NODES.atm ? "atm" : node.id === BANK_NODES.bank ? "bank" : null;
  const filtersActive = !!shown.q.trim() || !!shown.chip || !!shown.own || !!shown.ilce;
  const clearFilters = () => change({ ...shown, q: "", chip: null, own: null, ilce: null });

  const coachSteps: CoachStep[] = [
    { targetRef: chipsRef, text: "Ne arıyorsan seç: eczane, cami, durak, ATM, kurum…", placement: "top" },
    { targetRef: locateRef, text: "Haritada kaybolursan buraya dokun", placement: "top" },
    { targetRef: handleRef, text: "Listeyi yukarı çek, en yakından uzağa sıralı gör", placement: "top" },
  ];

  const card = (item: NearbyItem) => (
    <li key={item.id}>
      <NearbyCard
        item={item}
        now={now}
        showDistance={byDistance}
        selected={item.id === selectedId}
        demoDuty={dutyMode === "demo"}
        onShowOnMap={item.noPin ? undefined : showOnMap}
      />
    </li>
  );

  const toolbar = (
    <div className="flex flex-col gap-3">
      <div ref={chipsRef}>
        <DrillChips
          row={row}
          guideLink={row.trail.length === 0}
          onOpen={open}
          onToggle={(v) => change(toggleChip(shown, v))}
          onClear={(id) => change(clearLevel(shown, id))}
        />
      </div>
      {node.id === "eczane" ? <PharmacySwitch duty={shown.duty} onChange={(duty) => change({ ...shown, duty })} /> : null}
      {bankKind ? <BankSwitch current={bankKind} counts={dataset?.bankCounts} onChange={(k) => change(swapBankNode(shown, k))} /> : null}
      {total > 0 && !error ? (
        <SheetSearch
          value={shown.q}
          onChange={(v) => change({ ...shown, q: v })}
          onFocus={() => {
            if (snap === "peek") setSnap("half");
          }}
          label={`${title} içinde ara`}
          placeholder={isGuide ? "İsim ya da adres ara" : "Ara"}
        />
      ) : null}
    </div>
  );

  const guideNotes = isGuide ? (
    <>
      {guideRows.length > 0 && guidePins.length === 0 ? (
        <p className={cn(NOTE, "flex items-start gap-2")}>
          <MapPinOff className="mt-px size-3.5 shrink-0" aria-hidden />
          Bu kayıtların harita konumu henüz yok.
        </p>
      ) : guideRows.length > guidePins.length ? (
        <p className={NOTE}>{guideRows.length - guidePins.length} kaydın harita konumu henüz yok; onları yalnızca listede görürsün.</p>
      ) : null}
      {guidePins.length > MAX_PINS ? <p className={NOTE}>Haritada en yakın {MAX_PINS} kayıt gösteriliyor. Daraltmak için ara ya da bir filtre seç.</p> : null}
    </>
  ) : null;

  const source = isGuide ? (cfg && total ? guideSource(cfg.kind) : null) : nearbyFilter ? nearbySource(nearbyFilter) : null;

  const content = (
    <>
      {/* Hidden while searching so the matches start right under the search bar. */}
      {shown.q.trim() ? null : <LocationPrompt loc={loc} onLocate={locate} className="mb-3" />}

      {isGuide && hasBothOwnerships ? (
        <div className="mb-3">
          <Segmented<"hepsi" | Ownership>
            ariaLabel="Devlet ya da özel"
            value={shown.own ?? "hepsi"}
            onChange={(v) => change({ ...shown, own: v === "hepsi" ? null : v })}
            options={[
              { value: "hepsi", label: "Tümü" },
              { value: "devlet", label: "Devlet" },
              { value: "ozel", label: "Özel" },
            ]}
          />
        </div>
      ) : null}

      {dataset && !dataset.ok && total ? (
        <p className="mb-3 rounded-2xl bg-highlight-soft px-4 py-3 text-xs font-medium text-highlight-foreground dark:text-highlight">
          Listenin bir kısmı yüklenemedi. Sayfayı yenileyip tekrar dene.
        </p>
      ) : null}

      {loading ? (
        <ListSkeleton count={3} variant="card" />
      ) : error ? (
        <ErrorState compact description={error} onRetry={retry} />
      ) : total === 0 ? (
        nearbyFilter === "nobetci" ? (
          <DutyUnverified />
        ) : isGuide ? (
          <EmptyState
            compact
            icon={node.icon}
            title="Bu kategoride henüz kayıt yok"
            description="Diğer kategorilere göz atabilirsin."
            actionLabel="Şehir rehberine git"
            actionHref={routes.guide.root()}
          />
        ) : (
          <EmptyState compact icon={meta.icon} title="Yakında sonuç bulunamadı" description="Konumunu paylaşmayı ya da başka bir kategori seçmeyi dene." />
        )
      ) : count === 0 ? (
        <EmptyState
          compact
          icon={SearchX}
          tone="default"
          title="Sonuç bulunamadı"
          description={shown.q.trim() ? `"${shown.q.trim()}" için ${noun} bulamadık. Farklı bir kelime dene.` : "Bu filtrelerle kayıt yok."}
          action={
            filtersActive ? (
              <Button type="button" variant="secondary" className="rounded-full" onClick={clearFilters}>
                Filtreleri temizle
              </Button>
            ) : undefined
          }
        />
      ) : nearbyFilter === "hepsi" ? (
        // Every kind nearby, grouped: the nearest of each, then "Tümü" opens that kind.
        <div className="flex flex-col gap-5">
          {HEPSI_GROUPS.map((g) => {
            const list = nearbyVisible.filter((i) => i.kind === g.kind);
            const target = nodeForNearbyFilter(g.filter);
            if (!list.length || !target) return null;
            const gm = filterMeta(g.filter);
            return (
              <section key={g.filter} aria-label={gm.title}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="min-w-0 truncate text-[17px] font-semibold">
                    {gm.title} <span className="font-medium text-muted-foreground tabular-nums">{list.length}</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => open(target.nodeId)}
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
        <>
          <ul className="flex flex-col gap-3" aria-label={title}>
            {cards.map(card)}
          </ul>
          {isGuide && guideRows.length > cards.length ? (
            <Button type="button" variant="secondary" size="lg" className="mt-3 w-full rounded-full" onClick={() => setLimit((n) => n + STEP)}>
              Daha fazla göster ({guideRows.length - cards.length})
            </Button>
          ) : null}
        </>
      )}

      {!loading && !error ? guideNotes : null}
      {node.id === "gezilecek" ? (
        <Link
          href={routes.nearby.places()}
          className="mt-3 flex min-h-12 items-center justify-between gap-2 rounded-2xl bg-muted/70 px-4 text-sm font-semibold text-primary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Tüm gezilecek yerler
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : null}
      {source && !loading ? <DataSourceNote className="mt-3" {...source} /> : null}
    </>
  );

  return (
    <div ref={areaRef} className={NEARBY_AREA_CLASS}>
      {/* Map-first screen: the map loads with the page and stays for the screen's life; chip changes only move its pins. */}
      <div className="absolute inset-0">
        <GoogleMap
          points={points}
          user={loc.coords}
          center={loc.point}
          zoom={byDistance ? 14 : 12}
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
          ariaLabel={`${title} haritası`}
        />
      </div>

      {/* Nothing else on the map: the chips live in the sheet; the Şehir Rehberi door adds a back button. */}
      {backHref ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-4 pt-2.5">
          <button
            type="button"
            onClick={() => (canGoBack() ? router.back() : router.push(backHref))}
            aria-label="Geri"
            className={cn(ROUND_BUTTON, "size-11 text-foreground")}
          >
            <ArrowLeft className="size-5" strokeWidth={2.2} aria-hidden />
          </button>
        </div>
      ) : null}

      {areaH > 0 && ready ? (
        <NearbySheet
          snap={snap}
          onSnapChange={setSnap}
          height={areaH}
          topInset={TOP_SPACE}
          handleRef={handleRef}
          listRef={listRef}
          floating={
            <button
              ref={locateRef}
              type="button"
              onClick={locate}
              disabled={loc.status === "locating"}
              aria-label={loc.coords ? "Konumuma git" : "Konumumu bul"}
              className={cn(ROUND_BUTTON, "ml-auto size-12 text-primary disabled:opacity-80")}
            >
              {loc.status === "locating" ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <LocateFixed className="size-5" aria-hidden />}
            </button>
          }
          header={
            // The taxi layout on every list: the title on the left, the count in the right corner.
            <div className="flex items-center justify-between gap-3">
              <h2 className="min-w-0 truncate text-xl leading-tight font-bold">{title}</h2>
              <p className="shrink-0 text-sm font-semibold text-muted-foreground tabular-nums" aria-live="polite">
                {loading ? "Yükleniyor…" : `${count} ${noun}`}
              </p>
            </div>
          }
          toolbar={toolbar}
        >
          {content}
        </NearbySheet>
      ) : null}

      <CoachMarks steps={coachSteps} storageKey={COACH_KEY} enabled={!backHref && ready && !loading && areaH > 0 && !onboardingActive} />
    </div>
  );
}
