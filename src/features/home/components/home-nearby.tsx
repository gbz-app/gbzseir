"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Compass, Loader2, LocateFixed, Scissors, Trees, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { describeDutyWindow, isDutyActive } from "@/core/duty";
import { distanceMeters, formatDistance } from "@/core/geo";
import { routes } from "@/core/routes";
import { districtBySlug } from "@/config/districts";
import { CITY } from "@/config/site";
import { createClient } from "@/lib/supabase/client";
import { useApproxLocation } from "@/lib/location/use-approx-location";
import { useIsClient } from "@/lib/use-is-client";
import { KIND_META, districtLabel, poiHref } from "@/features/nearby/config";
import { parsePlaceDetails, parseStopDetails } from "@/features/nearby/lib/details";
import { formatCountdown, nextPrayer, type PrayerDay } from "@/features/nearby/lib/prayer";
import { formatWait, useStopTimes, type Departure } from "@/features/nearby/lib/stop-times";
import { useNow } from "@/features/nearby/lib/use-now";
import type { DutyMode, DutyRow, PoiKind, PoiRow } from "@/features/nearby/types";

/** After the pharmacy card: one card per kind, the nearest place of that kind. */
const KINDS: ReadonlyArray<{ kind: PoiKind; label: string }> = [
  { kind: "bus_stop", label: "Durak" },
  { kind: "mosque", label: "Cami" },
  { kind: "taxi", label: "Taksi" },
  { kind: "ev_charge", label: "Şarj" },
  { kind: "fuel", label: "Akaryakıt" },
];

/**
 * MOCKUP (owner's request, 12.09): sample prices and a sample taxi driver until real sources are connected (shown
 * without an "örnek" label, owner's decision).
 */
type PriceRow = { label: string; price: string };
const SAMPLE_PRICES: Partial<Record<PoiKind, PriceRow[]>> = {
  fuel: [
    { label: "Benzin", price: "47,90 TL" },
    { label: "Motorin", price: "49,10 TL" },
  ],
  ev_charge: [
    { label: "AC şarj", price: "8,50 TL/kWh" },
    { label: "DC hızlı", price: "12,90 TL/kWh" },
  ],
};
const SAMPLE_HAIR: PriceRow[] = [
  { label: "Saç kesimi", price: "350 TL" },
  { label: "Sakal", price: "150 TL" },
];
const SAMPLE_DRIVER = "Ali Yıldız";
/** Taximeter minimum fare ("indi-bindi"), a sample until the UKOME tariff is connected. */
const SAMPLE_TAXI_MIN = "İndi-bindi 100 TL";

const PARK_CATEGORIES = new Set(["park", "tabiat_parki"]);
/** Businesses that read as a hairdresser or barber (name or category). */
const HAIR_OR = ["kuaför", "kuafor", "berber"].flatMap((k) => [`name.ilike.*${k}*`, `category_label.ilike.*${k}*`]).join(",");
const PINK = "bg-pink-100 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300";
const LIME = "bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300";
/** "Yürüyerek N dk" at about 4.8 km/h, for parks up to this many minutes away. */
const WALK_M_PER_MIN = 80;
const MAX_WALK_MIN = 45;

const RADIUS_M = 25_000;
const NEXT_BUSES = 2;
const MAX_LINES = 3;
/** Short sideways cards with the home page's 28 px corners: kind on top, the name and one small line at the bottom. */
const CARD =
  "flex h-full min-h-[8.5rem] w-full flex-col rounded-[1.75rem] bg-card p-4 text-left outline-none transition-transform active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50";
/** Soft snapping (proximity), so a swipe comes to rest on a card without pulling the strip back. */
const ITEM = "w-[12.5rem] shrink-0 snap-start";
/** The Nöbetçi Eczane card is wider: kind, distance and tag on one row, the duty hours on one line. */
const DUTY_ITEM = "w-[17.5rem] shrink-0 snap-start";
const LABEL = "min-w-0 flex-1 truncate text-[15px] font-semibold text-muted-foreground";
const NAME = "mt-auto truncate pt-2.5 text-[17px] leading-snug font-semibold";
const FOOT = "mt-1 truncate text-sm font-semibold";
const PILL = "inline-flex h-8 max-w-full items-center gap-1.5 rounded-full px-3 text-[13px] font-bold whitespace-nowrap tabular-nums";

/** What the card shows under the name. */
type Foot =
  | { kind: "text" }
  | { kind: "duty"; start: string; end: string }
  | { kind: "stop"; stopId: string | null; lat: number; lng: number; lines: string[] }
  | { kind: "prayer" }
  | { kind: "taxi" }
  | { kind: "price"; rows: PriceRow[] }
  | { kind: "park"; category: string };

type Nearest = {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: string;
  name: string;
  href: string;
  distance: number | null;
  district: string | null;
  foot: Foot;
};

function footFor(r: PoiRow): Foot {
  if (r.kind === "bus_stop") {
    const stop = parseStopDetails(r.details);
    return { kind: "stop", stopId: stop.stopId, lat: r.lat, lng: r.lng, lines: stop.lines };
  }
  if (r.kind === "mosque") return { kind: "prayer" };
  if (r.kind === "taxi") return { kind: "taxi" };
  const rows = SAMPLE_PRICES[r.kind];
  return rows ? { kind: "price", rows } : { kind: "text" };
}

function fromPoi(r: PoiRow, label: string, extra: Partial<Pick<Nearest, "key" | "icon" | "tone" | "foot">> = {}): Nearest {
  const meta = KIND_META[r.kind];
  return {
    key: r.kind,
    label,
    icon: meta.icon,
    tone: meta.tone,
    name: r.name,
    href: poiHref(r.kind, r.slug),
    distance: typeof r.distance_m === "number" ? r.distance_m : null,
    district: districtLabel(r),
    foot: footFor(r),
    ...extra,
  };
}

async function loadNearest(point: { lat: number; lng: number }, dutyMode: DutyMode): Promise<Nearest[]> {
  const supabase = createClient();
  const at = { p_lat: point.lat, p_lng: point.lng };
  const nearestPois = async (kind: PoiKind, limit = 1): Promise<PoiRow[]> => {
    const { data, error } = await supabase.rpc("nearby_pois", { p_kind: kind, ...at, p_radius_m: RADIUS_M, p_limit: limit });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as PoiRow[];
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
          icon: KIND_META.duty.icon,
          tone: KIND_META.duty.tone,
          name: duty.name,
          href: routes.nearby.pharmacy(duty.slug),
          distance: duty.distance_m ?? null,
          district: districtLabel(duty),
          foot: { kind: "duty", start: duty.duty_start, end: duty.duty_end },
        };
      }
    }
    const [r] = await nearestPois("pharmacy");
    return r ? fromPoi(r, "Eczane") : null;
  };
  // Optional cards: when they cannot be read the strip goes on without them.
  const park = async (): Promise<Nearest | null> => {
    const r = (await nearestPois("place", 40)).find((p) => PARK_CATEGORIES.has(parsePlaceDetails(p.details).category));
    if (!r) return null;
    return fromPoi(r, "Park", { key: "park", icon: Trees, tone: LIME, foot: { kind: "park", category: parsePlaceDetails(r.details).category } });
  };
  const hairdresser = async (): Promise<Nearest | null> => {
    const { data, error } = await supabase
      .from("businesses")
      .select("slug,name,lat,lng,district_id")
      .eq("status", "approved")
      .not("lat", "is", null)
      .or(HAIR_OR)
      .limit(100);
    if (error) return null;
    let best: { slug: string; name: string; district_id: string | null } | null = null;
    let bestD = RADIUS_M;
    for (const b of data ?? []) {
      if (typeof b.lat !== "number" || typeof b.lng !== "number") continue;
      const d = distanceMeters(point, { lat: b.lat, lng: b.lng });
      if (d <= bestD) {
        bestD = d;
        best = b;
      }
    }
    if (!best) return null;
    return {
      key: "kuafor",
      label: "Kuaför",
      icon: Scissors,
      tone: PINK,
      name: best.name,
      href: routes.businesses.detail(best.slug),
      distance: bestD,
      district: districtBySlug(best.district_id)?.name ?? null,
      foot: { kind: "price", rows: SAMPLE_HAIR },
    };
  };
  const optional = (job: () => Promise<Nearest | null>) => job().catch(() => null);
  const rows = await Promise.all([
    pharmacy(),
    ...KINDS.map(async (k) => ((r) => (r ? fromPoi(r, k.label) : null))((await nearestPois(k.kind))[0])),
    optional(hairdresser),
    optional(park),
  ]);
  return rows.filter((r): r is Nearest => !!r);
}

/** Small icon tile in the card's colours (red with a white pill for pharmacies). */
function MiniIcon({ icon: Icon, tone }: { icon: LucideIcon; tone: string }) {
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tone)} aria-hidden>
      <Icon className="size-[18px]" strokeWidth={2.2} />
    </span>
  );
}

/** Nöbetçi Eczane: today's duty hours ("Bugün 08:30 - Yarın 08:30"). A sample duty list says "örnek" in the kind row. */
function DutyFoot({ start, end }: { start: string; end: string }) {
  return <span className={cn(FOOT, "text-[13px] font-bold text-red-600 tabular-nums")}>{describeDutyWindow({ start, end })}</span>;
}

/** A coming bus: red with a pulsing dot at "Şimdi", green within 5 minutes, calm blue otherwise. */
function BusPill({ d }: { d: Departure }) {
  const now = d.inMin <= 1;
  const soon = d.inMin <= 5;
  return (
    <span className={cn(PILL, now ? "bg-red-600 text-white" : soon ? "bg-emerald-600 text-white" : "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200")}>
      {now ? <span className="size-1.5 animate-pulse rounded-full bg-white motion-reduce:animate-none" aria-hidden /> : null}
      {d.line}
      <span className={cn("font-semibold", now || soon ? "text-white/85" : "text-sky-700 dark:text-sky-300")}>{formatWait(d)}</span>
    </span>
  );
}

/** Durak: the next buses by the timetable, soonest first; else the stop's lines. */
function StopFoot({ stop }: { stop: Extract<Foot, { kind: "stop" }> }) {
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
        <span key={l} className={cn(PILL, "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200")}>
          {l}
        </span>
      ))}
      {lines.length > MAX_LINES ? <span className="self-center text-[13px] font-semibold text-muted-foreground">+{lines.length - MAX_LINES}</span> : null}
    </span>
  );
}

/** Cami: the next prayer and the time left ("Öğle 13:05 · 42 dk"), deep green in its last 15 minutes. */
function PrayerFoot({ days, fallback }: { days: PrayerDay[]; fallback: string | null }) {
  const now = useNow();
  const next = now ? nextPrayer(days, now) : null;
  if (!next) return fallback ? <span className={cn(FOOT, "text-muted-foreground")}>{fallback}</span> : null;
  const left = next.at - now;
  const soon = left <= 15 * 60_000;
  return (
    <span className="mt-2 flex" aria-label={`Sıradaki vakit ${next.label} ${next.time}`}>
      <span className={cn(PILL, soon ? "bg-emerald-600 text-white" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200")}>
        {next.label} {next.time}
        <span className={cn("font-semibold", soon ? "text-white/85" : "text-emerald-700 dark:text-emerald-300")}>{formatCountdown(left)}</span>
      </span>
    </span>
  );
}

/** Taksi: a round profile picture (3D avatar, not a real person), the driver's name and the taximeter's minimum fare. */
function TaxiFoot() {
  return (
    <span className="mt-2 flex items-center gap-2">
      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-yellow-100" aria-hidden>
        <Image src="/images/emoji/man-3d.webp" alt="" width={32} height={32} className="size-8" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-semibold">{SAMPLE_DRIVER}</span>
        <span className="block truncate text-[13px] font-bold text-amber-700 tabular-nums">{SAMPLE_TAXI_MIN}</span>
      </span>
    </span>
  );
}

/** Şarj / akaryakıt / kuaför: two price rows ("Benzin 47,90 TL", "Motorin 49,10 TL"). */
function PriceFoot({ rows }: { rows: PriceRow[] }) {
  return (
    <span className="mt-2 flex flex-col gap-0.5 text-[13px] tabular-nums">
      {rows.slice(0, 2).map((r) => (
        <span key={r.label} className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate font-medium text-muted-foreground">{r.label}</span>
          <span className="shrink-0 font-bold">{r.price}</span>
        </span>
      ))}
    </span>
  );
}

/** Park: the walk from the user's GPS position ("Yürüyerek 6 dk"); without it, what kind of green space it is. */
function ParkFoot({ category, distance }: { category: string; distance: number | null }) {
  const walk = distance != null ? Math.max(1, Math.round(distance / WALK_M_PER_MIN)) : null;
  const text = walk != null && walk <= MAX_WALK_MIN ? `Yürüyerek ${walk} dk` : category === "tabiat_parki" ? "Tabiat parkı" : "Yeşil alan";
  return <span className={cn(FOOT, "text-lime-700")}>{text}</span>;
}

function NearestCard({ n, showDistance, sample, prayerDays }: { n: Nearest; showDistance: boolean; sample: boolean; prayerDays: PrayerDay[] }) {
  // With a GPS fix the distance sits on the right of the kind ("Durak 120 m", "Nöbetçi Eczane 850 m").
  const distance = showDistance && n.distance != null ? n.distance : null;
  const right = distance != null ? formatDistance(distance) : null;
  // The sample duty list (demo mode) is marked with a small "örnek", like the sample prices: a made-up duty would send
  // people to a closed pharmacy at night.
  const tag = n.foot.kind === "duty" && sample ? "örnek" : null;
  let foot: React.ReactNode;
  switch (n.foot.kind) {
    case "duty":
      foot = <DutyFoot start={n.foot.start} end={n.foot.end} />;
      break;
    case "stop":
      foot = <StopFoot stop={n.foot} />;
      break;
    case "prayer":
      foot = <PrayerFoot days={prayerDays} fallback={right ? null : n.district} />;
      break;
    case "taxi":
      foot = <TaxiFoot />;
      break;
    case "price":
      foot = <PriceFoot rows={n.foot.rows} />;
      break;
    case "park":
      foot = <ParkFoot category={n.foot.category} distance={distance} />;
      break;
    default:
      foot = !right && n.district ? <span className={cn(FOOT, "text-muted-foreground")}>{n.district}</span> : null;
  }
  return (
    <Link href={n.href} className={CARD}>
      <span className="flex items-center gap-2">
        <MiniIcon icon={n.icon} tone={n.tone} />
        <span className={LABEL}>{n.label}</span>
        {right ? <span className="shrink-0 text-sm font-semibold text-muted-foreground tabular-nums">{right}</span> : null}
        {tag ? <span className="shrink-0 text-xs font-semibold text-muted-foreground">{tag}</span> : null}
      </span>
      <span className={NAME}>{n.name}</span>
      {foot}
    </Link>
  );
}

/**
 * Home "Yakınımda": what is near the user, one short sideways card each: the nearest Nöbetçi Eczane with today's duty
 * hours (else the nearest eczane), durak with its next buses, cami with the next prayer, taksi (driver and minimum
 * fare), şarj, akaryakıt and kuaför (two price rows) and park; with a GPS fix the distance sits on the right. A card
 * opens the place's page. Client-only (the location lives on the device); the first card asks for the location when
 * there is no GPS fix. Only the rounded point is sent. `dutyMode`: app setting (the sample duty list gets a small
 * "örnek"); `prayerDays`: today's and tomorrow's prayer times (Gebze).
 */
export function HomeNearby({ dutyMode, prayerDays }: { dutyMode: DutyMode; prayerDays: PrayerDay[] }) {
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
    <ul className="no-scrollbar -mx-4 flex snap-x snap-proximity scroll-px-4 items-stretch gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1" aria-busy={!settled}>
      {isClient && !gps ? (
        <li className={ITEM}>
          <button type="button" onClick={() => void loc.request()} disabled={loc.status === "locating"} className={CARD}>
            <span className="flex items-center gap-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary" aria-hidden>
                {loc.status === "locating" ? <Loader2 className="size-[18px] animate-spin" /> : <LocateFixed className="size-[18px]" strokeWidth={2.2} />}
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
              <span className="block h-[8.5rem] animate-pulse rounded-[1.75rem] bg-card motion-reduce:animate-none" />
            </li>
          ))
        : state.items?.length
          ? state.items.map((n) => (
              <li key={n.key} className={n.key === "duty" ? DUTY_ITEM : ITEM}>
                <NearestCard n={n} showDistance={gps} sample={n.key === "duty" && dutyMode === "demo"} prayerDays={prayerDays} />
              </li>
            ))
          : (
              <li className={ITEM}>
                <Link href={routes.nearby.root()} className={CARD}>
                  <span className="flex items-center gap-2">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary" aria-hidden>
                      <Compass className="size-[18px]" strokeWidth={2.2} />
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
