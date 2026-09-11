"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Clock3, Loader2, LocateFixed, MapPin, Navigation } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { describeDutyWindow } from "@/core/duty";
import { Button } from "@/components/ui/button";
import { DataSourceNote } from "@/components/shared/data-source-note";
import { EmptyState } from "@/components/shared/empty-state";
import { NeighbourhoodPicker } from "@/components/shared/neighbourhood-picker";
import { useApproxLocation } from "@/lib/location/use-approx-location";
import { ECZACI_ODASI_NAME, ECZACI_ODASI_URL } from "../config";
import { buildDutyView, sortDutyRows } from "../lib/duty-view";
import { useNow } from "../lib/use-now";
import type { DutyRow } from "../types";
import { DutyCard } from "./duty-card";
import { DutyUnverified } from "./duty-unverified";

export type DutyBrowserProps = {
  rows: DutyRow[];
  /** Server render time (hydration "now"). */
  serverNow: number;
  fetchedAt: string | null;
  ok: boolean;
};

type Tab = "now" | "next";

/**
 * D2 list: "Bugün / Yarın" tabs, filtered at render time (the HTML may come from ISR or the service worker),
 * sorted by distance when a location is known, refreshed automatically at the 08:30 switch.
 */
export function DutyBrowser({ rows, serverNow, fetchedAt, ok }: DutyBrowserProps) {
  const router = useRouter();
  const now = useNow(serverNow);
  const loc = useApproxLocation();
  const [tab, setTab] = React.useState<Tab>("now");
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const view = React.useMemo(() => buildDutyView(rows, now), [rows, now]);
  const point = loc.pointSource === "city" ? null : loc.point;
  const pLat = point?.lat;
  const pLng = point?.lng;
  const list = tab === "now" ? view.current : view.next;
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
    { id: "now", label: view.currentLabel, count: view.current.length },
    { id: "next", label: view.nextLabel, count: view.next.length },
  ];

  return (
    <div className="flex flex-col gap-3">
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

      {loc.pointSource === "city" ? (
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={locate} disabled={loc.status === "locating"}>
            {loc.status === "locating" ? <Loader2 className="animate-spin" /> : <LocateFixed />}
            Konumuma göre sırala
          </Button>
          <Button type="button" variant="ghost" onClick={() => setPickerOpen(true)}>
            <MapPin />
            Mahalle seç
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 px-1 text-sm text-muted-foreground">
          <Navigation className="size-4 shrink-0 text-primary" aria-hidden />
          {loc.pointSource === "gps" ? "Sana en yakın olan en üstte." : `${loc.neighbourhood?.name ?? "Mahallen"} merkezine en yakın olan en üstte.`}
          <button type="button" onClick={() => setPickerOpen(true)} className="ml-auto min-h-11 shrink-0 px-1 font-semibold text-primary">
            Değiştir
          </button>
        </p>
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
                />
              </li>
            ))}
          </ul>
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
        source="Nöbet listesi"
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

      <NeighbourhoodPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        showTrigger={false}
        showUseLocation
        value={loc.neighbourhood?.id ?? null}
        title="Mahalleni seç"
      />
    </div>
  );
}
