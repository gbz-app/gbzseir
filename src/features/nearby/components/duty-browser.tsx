"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Clock3, Loader2, LocateFixed, MapPin, Navigation } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { describeDutyWindow } from "@/core/duty";
import { districtBySlug, type DistrictSlug } from "@/config/districts";
import { Button } from "@/components/ui/button";
import { DataSourceNote } from "@/components/shared/data-source-note";
import { DistrictPicker } from "@/components/shared/district-picker";
import { EmptyState } from "@/components/shared/empty-state";
import { useApproxLocation } from "@/lib/location/use-approx-location";
import { ECZACI_ODASI_NAME, ECZACI_ODASI_URL } from "../config";
import { buildDutyView, sortDutyRows } from "../lib/duty-view";
import { useNow } from "../lib/use-now";
import type { DutyMode, DutyRow } from "../types";
import { DutyCard, DutyDemoNote } from "./duty-card";
import { DutyUnverified } from "./duty-unverified";

export type DutyBrowserProps = {
  rows: DutyRow[];
  /** Server render time (hydration "now"). */
  serverNow: number;
  fetchedAt: string | null;
  ok: boolean;
  /** Duty data mode; "demo" labels the list and every card as sample data. */
  mode: DutyMode;
};

type Tab = "now" | "next";

/** A district picked on this page, "all" for every district, null to follow the user's district (GPS fix or choice). */
type DistrictChoice = DistrictSlug | "all" | null;

const DEMO_SOURCE = "Örnek veri (gerçek liste değil)";

/**
 * D2 list: "Bugün / Yarın" tabs, filtered at render time (the HTML may come from ISR or the service worker), narrowed to
 * one district (the user's by default) when the rows carry it, sorted by distance when a location or district is known,
 * refreshed automatically at the 08:30 switch.
 */
export function DutyBrowser({ rows, serverNow, fetchedAt, ok, mode }: DutyBrowserProps) {
  const demo = mode === "demo";
  const router = useRouter();
  const now = useNow(serverNow);
  const loc = useApproxLocation();
  const [tab, setTab] = React.useState<Tab>("now");
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [choice, setChoice] = React.useState<DistrictChoice>(null);

  // The list can be narrowed to a district only when the rows carry it (duty RPCs of 2026091380).
  const canFilter = React.useMemo(() => rows.some((r) => !!r.district_id), [rows]);
  const picked = choice && choice !== "all" ? choice : null;
  const filter = canFilter && choice !== "all" ? (picked ?? loc.district) : null;
  const filterDistrict = districtBySlug(filter);
  // Sort point: the GPS fix, else the centre of the picked (or the user's) district.
  const refDistrict = districtBySlug(picked ?? loc.district);
  const point = loc.coords ?? refDistrict?.center ?? null;
  const pLat = point?.lat;
  const pLng = point?.lng;

  const view = React.useMemo(() => buildDutyView(rows, now), [rows, now]);
  const { current: currentAll, next: nextAll } = view;
  const current = React.useMemo(() => (filter ? currentAll.filter((r) => r.district_id === filter) : currentAll), [currentAll, filter]);
  const next = React.useMemo(() => (filter ? nextAll.filter((r) => r.district_id === filter) : nextAll), [nextAll, filter]);
  const list = tab === "now" ? current : next;
  // Rows of the tab hidden by the district filter (the empty state then offers "Tüm ilçeleri göster").
  const others = (tab === "now" ? currentAll : nextAll).length - list.length;
  const sorted = React.useMemo(
    () => sortDutyRows(list, typeof pLat === "number" && typeof pLng === "number" ? { lat: pLat, lng: pLng } : null),
    [list, pLat, pLng],
  );

  // Fetch the new list right after the 08:30 switch while the page stays open.
  const switchAt = view.currentWindow.end.getTime();
  React.useEffect(() => {
    const ms = switchAt - Date.now() + 5000;
    if (ms <= 0 || ms > 26 * 3_600_000) return;
    const id = window.setTimeout(() => router.refresh(), ms);
    return () => window.clearTimeout(id);
  }, [switchAt, router]);

  // Cached (ISR / offline) HTML older than 10 minutes: ask for fresh data once.
  React.useEffect(() => {
    if (Date.now() - serverNow > 10 * 60_000 && navigator.onLine) router.refresh();
  }, [serverNow, router]);

  const locate = async () => {
    const coords = await loc.request();
    if (coords) toast.success("Konumun alındı, en yakın eczane en üstte.");
    else setPickerOpen(true);
  };

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: "now", label: view.currentLabel, count: current.length },
    { id: "next", label: view.nextLabel, count: next.length },
  ];
  const chipLabel = canFilter ? (filterDistrict?.name ?? "Tüm ilçeler") : (refDistrict?.name ?? "İlçe seç");

  return (
    <div className="flex flex-col gap-3">
      {demo ? <DutyDemoNote /> : null}

      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        aria-haspopup="dialog"
        aria-label={`İlçe: ${chipLabel}`}
        className="inline-flex h-9 max-w-full items-center gap-1.5 self-start rounded-full bg-card px-3.5 text-[13px] font-semibold transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="truncate">{chipLabel}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      <div role="tablist" aria-label="Nöbet günü" className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              id={`nobet-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="nobet-listesi"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex h-11 items-center justify-center gap-1.5 rounded-xl text-[15px] font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-highlight-soft text-highlight-foreground" : "bg-background/60")}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-sm">
        <p className="flex items-center gap-1.5 font-semibold">
          <Clock3 className="size-4 text-highlight" aria-hidden />
          {tab === "now" ? view.currentText : view.nextText}
        </p>
        <p className="text-xs text-muted-foreground">Nöbet her gün 08:30&apos;da değişir.</p>
      </div>

      {loc.coords ? (
        <p className="flex items-center gap-1.5 px-1 text-sm text-muted-foreground">
          <Navigation className="size-4 shrink-0 text-primary" aria-hidden />
          Sana en yakın olan en üstte.
        </p>
      ) : refDistrict ? (
        <p className="flex items-center gap-1.5 px-1 text-sm text-muted-foreground">
          <Navigation className="size-4 shrink-0 text-primary" aria-hidden />
          {refDistrict.name} merkezine en yakın olan en üstte.
          <button
            type="button"
            onClick={locate}
            disabled={loc.status === "locating"}
            className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-1 px-1 font-semibold text-primary disabled:opacity-70"
          >
            {loc.status === "locating" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LocateFixed className="size-4" aria-hidden />}
            Konumum
          </button>
        </p>
      ) : (
        <Button type="button" variant="outline" onClick={locate} disabled={loc.status === "locating"}>
          {loc.status === "locating" ? <Loader2 className="animate-spin" /> : <LocateFixed />}
          Konumuma göre sırala
        </Button>
      )}

      <div id="nobet-listesi" role="tabpanel" aria-labelledby={`nobet-tab-${tab}`}>
        {sorted.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {sorted.map((r) => (
              <li key={r.duty_id}>
                <DutyCard
                  row={r}
                  distance={r.distance}
                  windowText={describeDutyWindow({ start: r.duty_start, end: r.duty_end }, now)}
                  onDuty={tab === "now"}
                  demo={demo || r.source === "demo"}
                />
              </li>
            ))}
          </ul>
        ) : filterDistrict && others > 0 ? (
          <EmptyState
            compact
            icon={MapPin}
            title={`${filterDistrict.name} için nöbet listesi yok`}
            description="Diğer ilçelerin nöbetçi eczanelerine bakabilirsin."
            action={
              <Button type="button" variant="secondary" className="rounded-full" onClick={() => setChoice("all")}>
                Tüm ilçeleri göster
              </Button>
            }
          />
        ) : tab === "now" || !ok ? (
          <DutyUnverified />
        ) : (
          <EmptyState
            compact
            tone="warning"
            icon={Clock3}
            title="Sonraki nöbet listesi henüz yok"
            description={`Liste genellikle bir gün önceden yayınlanır. Güncel liste için ${ECZACI_ODASI_NAME}'nı kontrol edin.`}
          />
        )}
      </div>

      <DataSourceNote
        source={demo ? DEMO_SOURCE : "Nöbet listesi"}
        updatedAt={fetchedAt}
        callAhead
        note={
          <>
            Güncel liste için{" "}
            <a href={ECZACI_ODASI_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground underline underline-offset-2">
              {ECZACI_ODASI_NAME}
            </a>
            &apos;nı kontrol edin.
          </>
        }
      />

      {/* Only this list: the pick narrows it (and sorts by that district's centre) without changing the saved district. */}
      <DistrictPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        showTrigger={false}
        showUseLocation
        value={canFilter ? filter : (refDistrict?.slug ?? null)}
        onChange={(d) => setChoice(d ? d.slug : "all")}
        allowClear={canFilter}
        clearLabel="Tüm ilçeler"
        title={canFilter ? "İlçe seç" : undefined}
        description={canFilter ? "Seçtiğin ilçenin nöbetçi eczanelerini gösteririz." : undefined}
      />
    </div>
  );
}
