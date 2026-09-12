"use client";

import * as React from "react";
import Link from "next/link";
import { Compass, Loader2, LocateFixed } from "lucide-react";
import { cn } from "@/lib/utils";
import { isDutyActive } from "@/core/duty";
import { formatDistance } from "@/core/geo";
import { routes } from "@/core/routes";
import { districtBySlug } from "@/config/districts";
import { CITY } from "@/config/site";
import { createClient } from "@/lib/supabase/client";
import { useApproxLocation } from "@/lib/location/use-approx-location";
import { useIsClient } from "@/lib/use-is-client";
import { KIND_META, districtLabel, poiHref } from "@/features/nearby/config";
import { parseStopDetails } from "@/features/nearby/lib/details";
import { formatWait, useStopTimes, type Departure } from "@/features/nearby/lib/stop-times";
import type { DutyMode, DutyRow, MarkerKind, PoiKind, PoiRow } from "@/features/nearby/types";

/** After the pharmacy card: one card per kind, the nearest place of that kind. */
const KINDS: ReadonlyArray<{ kind: PoiKind; label: string }> = [
  { kind: "bus_stop", label: "Durak" },
  { kind: "mosque", label: "Cami" },
  { kind: "taxi", label: "Taksi" },
  { kind: "ev_charge", label: "Şarj" },
  { kind: "fuel", label: "Akaryakıt" },
];

const RADIUS_M = 25_000;
const NEXT_BUSES = 2;
const MAX_LINES = 3;
/** Short and a little wider than before: kind on top, the name and one small line at the bottom, so the strip lines up. */
const CARD =
  "flex h-full min-h-[7.5rem] w-full flex-col rounded-3xl bg-card p-3.5 text-left outline-none transition-transform active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50";
/** No scroll snapping: a snapped strip jumps to its old card when the location card is added in front after hydration. */
const ITEM = "w-[11.5rem] shrink-0";
const LABEL = "min-w-0 flex-1 truncate text-[13px] font-semibold text-muted-foreground";
const NAME = "mt-auto truncate pt-2.5 text-[15px] leading-snug font-semibold";
const FOOT = "mt-1 truncate text-xs font-semibold";

type Nearest = {
  key: string;
  label: string;
  kind: MarkerKind;
  name: string;
  href: string;
  distance: number | null;
  district: string | null;
  /** Durak: what the timetable needs, and the stop's known lines. */
  stop?: { stopId: string | null; lat: number; lng: number; lines: string[] };
};

function fromPoi(r: PoiRow, label: string): Nearest {
  const stop = r.kind === "bus_stop" ? parseStopDetails(r.details) : null;
  return {
    key: r.kind,
    label,
    kind: r.kind,
    name: r.name,
    href: poiHref(r.kind, r.slug),
    distance: typeof r.distance_m === "number" ? r.distance_m : null,
    district: districtLabel(r),
    stop: stop ? { stopId: stop.stopId, lat: r.lat, lng: r.lng, lines: stop.lines } : undefined,
  };
}

async function loadNearest(point: { lat: number; lng: number }, dutyMode: DutyMode): Promise<Nearest[]> {
  const supabase = createClient();
  const at = { p_lat: point.lat, p_lng: point.lng };
  const nearestPoi = async (kind: PoiKind): Promise<PoiRow | null> => {
    const { data, error } = await supabase.rpc("nearby_pois", { p_kind: kind, ...at, p_radius_m: RADIUS_M, p_limit: 1 });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as PoiRow[])[0] ?? null;
  };
  // First card: the nearest pharmacy on duty right now; the nearest pharmacy when there is no duty list ("off", none now).
  const pharmacy = async (): Promise<Nearest | null> => {
    if (dutyMode !== "off") {
      const { data } = await supabase.rpc("duty_pharmacies_now", at);
      const now = Date.now();
      const duty = ((data ?? []) as unknown as DutyRow[])
        .filter((r) => isDutyActive(r.duty_start, r.duty_end, now))
        .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity))[0];
      if (duty) {
        return {
          key: "duty",
          label: "Nöbetçi Eczane",
          kind: "duty",
          name: duty.name,
          href: routes.nearby.pharmacy(duty.slug),
          distance: duty.distance_m ?? null,
          district: districtLabel(duty),
        };
      }
    }
    const r = await nearestPoi("pharmacy");
    return r ? fromPoi(r, "Eczane") : null;
  };
  const rows = await Promise.all([pharmacy(), ...KINDS.map(async (k) => ((r) => (r ? fromPoi(r, k.label) : null))(await nearestPoi(k.kind)))]);
  return rows.filter((r): r is Nearest => !!r);
}

/** Small icon tile in the kind's colours (red with a white pill for pharmacies). */
function MiniIcon({ kind }: { kind: MarkerKind }) {
  const meta = KIND_META[kind];
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl", meta.tone)} aria-hidden>
      <meta.icon className="size-4" strokeWidth={2.2} />
    </span>
  );
}

/** A coming bus: red with a pulsing dot at "Şimdi", green within 5 minutes, calm blue otherwise. */
function BusPill({ d }: { d: Departure }) {
  const now = d.inMin <= 1;
  const soon = d.inMin <= 5;
  return (
    <span
      className={cn(
        "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full px-2.5 text-xs font-bold whitespace-nowrap tabular-nums",
        now ? "bg-red-600 text-white" : soon ? "bg-emerald-600 text-white" : "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200",
      )}
    >
      {now ? <span className="size-1.5 animate-pulse rounded-full bg-white motion-reduce:animate-none" aria-hidden /> : null}
      {d.line}
      <span className={cn("font-semibold", now || soon ? "text-white/85" : "text-sky-700 dark:text-sky-300")}>{formatWait(d)}</span>
    </span>
  );
}

/** Durak card foot: the next buses by the timetable, soonest first; else the stop's lines. */
function StopFoot({ stop }: { stop: NonNullable<Nearest["stop"]> }) {
  const times = useStopTimes(stop.stopId, stop.lat, stop.lng, NEXT_BUSES);
  if (times.upcoming.length) {
    return (
      <span className="mt-2 flex gap-1.5 overflow-hidden" aria-label="Yaklaşan otobüsler">
        {times.upcoming.map((d) => (
          <BusPill key={`${d.line}-${d.minutes}`} d={d} />
        ))}
      </span>
    );
  }
  const lines = stop.lines.length ? stop.lines : times.lines;
  if (!lines.length) return null;
  return (
    <span className="mt-2 flex gap-1 overflow-hidden" aria-label={`Hatlar: ${lines.join(", ")}`}>
      {lines.slice(0, MAX_LINES).map((l) => (
        <span key={l} className="inline-flex h-7 items-center rounded-full bg-sky-100 px-2.5 text-xs font-bold text-sky-800 tabular-nums dark:bg-sky-500/15 dark:text-sky-200">
          {l}
        </span>
      ))}
      {lines.length > MAX_LINES ? <span className="self-center text-xs font-semibold text-muted-foreground">+{lines.length - MAX_LINES}</span> : null}
    </span>
  );
}

function NearestCard({ n, showDistance, sample }: { n: Nearest; showDistance: boolean; sample: boolean }) {
  // The sample duty list keeps its warning, even on this small card.
  const foot = sample ? "Örnek liste" : showDistance && n.distance != null ? formatDistance(n.distance) : n.district;
  return (
    <Link href={n.href} className={CARD}>
      <span className="flex items-center gap-2">
        <MiniIcon kind={n.kind} />
        <span className={LABEL}>{n.label}</span>
      </span>
      <span className={NAME}>{n.name}</span>
      {n.stop ? (
        <StopFoot stop={n.stop} />
      ) : foot ? (
        <span className={cn(FOOT, "tabular-nums", sample ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>{foot}</span>
      ) : null}
    </Link>
  );
}

/**
 * Home "Yakınımda": what is near the user, one short sideways card per kind: the nearest Nöbetçi Eczane (else the
 * nearest eczane), durak with its next buses, cami, taksi, şarj, akaryakıt; a card opens the place's page. Client-only
 * (the location lives on the device); the first card asks for the location when there is no GPS fix. Only the rounded
 * point is sent (nearby_pois, duty_pharmacies_now). `dutyMode`: app setting (sample duty list is marked "Örnek liste").
 */
export function HomeNearby({ dutyMode }: { dutyMode: DutyMode }) {
  const isClient = useIsClient();
  const loc = useApproxLocation();
  const { lat, lng } = loc.point;
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const [state, setState] = React.useState<{ key: string; items: Nearest[] | null }>({ key: "", items: null });

  React.useEffect(() => {
    if (!isClient) return;
    let alive = true;
    loadNearest({ lat, lng }, dutyMode)
      .then((items) => alive && setState({ key, items }))
      .catch(() => alive && setState({ key, items: null }));
    return () => {
      alive = false;
    };
  }, [isClient, key, lat, lng, dutyMode]);

  const gps = loc.pointSource === "gps";
  const settled = state.key === key;
  const place = districtBySlug(loc.district)?.name ?? CITY.name;

  return (
    <ul className="no-scrollbar -mx-4 flex items-stretch gap-3 overflow-x-auto px-4 pb-1" aria-busy={!settled}>
      {isClient && !gps ? (
        <li className={ITEM}>
          <button type="button" onClick={() => void loc.request()} disabled={loc.status === "locating"} className={CARD}>
            <span className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary" aria-hidden>
                {loc.status === "locating" ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" strokeWidth={2.2} />}
              </span>
              <span className={LABEL}>Konum</span>
            </span>
            <span className={NAME}>Konumunu kullan</span>
            <span className={cn(FOOT, "font-medium text-muted-foreground")}>Şu an {place} merkezine göre</span>
          </button>
        </li>
      ) : null}
      {!settled
        ? Array.from({ length: 3 }, (_, i) => (
            <li key={`bos-${i}`} className={ITEM} aria-hidden>
              <span className="block h-[7.5rem] animate-pulse rounded-3xl bg-card motion-reduce:animate-none" />
            </li>
          ))
        : state.items?.length
          ? state.items.map((n) => (
              <li key={n.key} className={ITEM}>
                <NearestCard n={n} showDistance={gps} sample={n.key === "duty" && dutyMode === "demo"} />
              </li>
            ))
          : (
              <li className={ITEM}>
                <Link href={routes.nearby.root()} className={CARD}>
                  <span className="flex items-center gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary" aria-hidden>
                      <Compass className="size-4" strokeWidth={2.2} />
                    </span>
                    <span className={LABEL}>Keşfet</span>
                  </span>
                  <span className={NAME}>Haritayı aç</span>
                  <span className={cn(FOOT, "font-medium text-muted-foreground")}>Yakındakiler şu an yüklenemedi</span>
                </Link>
              </li>
            )}
    </ul>
  );
}
