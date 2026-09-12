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
    { label: "AC", price: "8,50 TL/kWh" },
    { label: "DC", price: "12,90 TL/kWh" },
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
/** Buses in the durak card's pill row (it scrolls sideways). */
const NEXT_BUSES = 6;
const MAX_LINES = 6;

/*
 * Every card is the same (owner, 12.09): 15 rem wide, three rows - the kind (and the distance), the name, a row of
 * pills that scrolls sideways inside the card - with the same type sizes, so the names line up across the strip.
 * The card stays still under the finger (no press scale): a shrinking card made the pill row hard to swipe on a phone.
 */
const CARD = "flex h-full w-full flex-col rounded-[1.75rem] bg-card p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
/** No scroll snapping on the strip: snapping fought the pill rows' own sideways scroll. */
const ITEM = "w-[15rem] shrink-0";
const LABEL = "min-w-0 flex-1 truncate text-[15px] font-semibold text-muted-foreground";
const NAME = "mt-3 truncate text-[17px] leading-snug font-semibold";
/**
 * Third row: one line of pills, scrolling sideways inside the card (to its edges). overscroll-x-contain keeps a swipe
 * on it from dragging the strip once the pills reach their end; touch-action stays default, so a vertical swipe that
 * starts on a card still scrolls the page.
 */
const PILLS = "no-scrollbar -mx-4 mt-3 flex h-8 gap-1.5 overflow-x-auto overscroll-x-contain px-4";
/** A 32 px pill in the home corner family (rounded-xl, not rounded-full), so it reads like the app's other buttons. */
const PILL = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[13px] font-bold whitespace-nowrap tabular-nums";
const MUTED_PILL = `${PILL} bg-muted text-foreground`;
/** A card's height (p-4, the three rows and their gaps), for the loading placeholders. */
const CARD_H = "h-[9.25rem]";

/** What the card shows in its pill row. */
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

/** Durak: the next buses by the timetable, soonest first (the row scrolls); else the stop's lines. */
function StopPills({ stop, fallback }: { stop: Extract<Foot, { kind: "stop" }>; fallback: string | null }) {
  const times = useStopTimes(stop.stopId, stop.lat, stop.lng, NEXT_BUSES);
  if (times.upcoming.length) return times.upcoming.map((d) => <BusPill key={`${d.line}-${d.minutes}`} d={d} />);
  const lines = stop.lines.length ? stop.lines : times.lines;
  if (!lines.length) return fallback ? <span className={MUTED_PILL}>{fallback}</span> : null;
  return lines.slice(0, MAX_LINES).map((l) => (
    <span key={l} className={cn(PILL, "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200")}>
      {l}
    </span>
  ));
}

/** Cami: the next prayer and the time left ("Öğle 13:05 · 42 dk"), deep green in its last 15 minutes. */
function PrayerPills({ days, fallback }: { days: PrayerDay[]; fallback: string | null }) {
  const now = useNow();
  const next = now ? nextPrayer(days, now) : null;
  if (!next) return fallback ? <span className={MUTED_PILL}>{fallback}</span> : null;
  const left = next.at - now;
  const soon = left <= 15 * 60_000;
  return (
    <span className={cn(PILL, soon ? "bg-emerald-600 text-white" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200")}>
      {next.label} {next.time}
      <span className={cn("font-semibold", soon ? "text-white/85" : "text-emerald-700 dark:text-emerald-300")}>{formatCountdown(left)}</span>
    </span>
  );
}

/** Taksi: the driver (3D avatar, not a real person) and the taximeter's minimum fare. */
function TaxiPills() {
  return (
    <>
      <span className={cn(PILL, "bg-yellow-100 pl-1 text-yellow-900")}>
        <Image src="/images/emoji/man-3d.webp" alt="" width={24} height={24} className="size-6 rounded-full" />
        {SAMPLE_DRIVER}
      </span>
      <span className={cn(PILL, "bg-amber-50 text-amber-800")}>{SAMPLE_TAXI_MIN}</span>
    </>
  );
}

/** Şarj / akaryakıt / kuaför: one pill per price ("Benzin 47,90 TL", "Motorin 49,10 TL"). */
function PricePills({ rows }: { rows: PriceRow[] }) {
  return rows.map((r) => (
    <span key={r.label} className={MUTED_PILL}>
      <span className="font-semibold text-muted-foreground">{r.label}</span>
      {r.price}
    </span>
  ));
}

/** Park: the walk from the user's GPS position ("Yürüyerek 6 dk"); without it, what kind of green space it is. */
function ParkPill({ category, distance }: { category: string; distance: number | null }) {
  const walk = distance != null ? Math.max(1, Math.round(distance / WALK_M_PER_MIN)) : null;
  const text = walk != null && walk <= MAX_WALK_MIN ? `Yürüyerek ${walk} dk` : category === "tabiat_parki" ? "Tabiat parkı" : "Yeşil alan";
  return <span className={cn(PILL, "bg-lime-100 text-lime-800")}>{text}</span>;
}

function NearestCard({ n, showDistance, prayerDays }: { n: Nearest; showDistance: boolean; prayerDays: PrayerDay[] }) {
  // With a GPS fix the distance sits on the right of the kind ("Durak 120 m", "Nöbetçi Eczane 850 m").
  const distance = showDistance && n.distance != null ? n.distance : null;
  const right = distance != null ? formatDistance(distance) : null;
  let pills: React.ReactNode;
  switch (n.foot.kind) {
    case "duty":
      pills = <span className={cn(PILL, "bg-red-50 text-red-700")}>{describeDutyWindow({ start: n.foot.start, end: n.foot.end })}</span>;
      break;
    case "stop":
      pills = <StopPills stop={n.foot} fallback={n.district} />;
      break;
    case "prayer":
      pills = <PrayerPills days={prayerDays} fallback={n.district} />;
      break;
    case "taxi":
      pills = <TaxiPills />;
      break;
    case "price":
      pills = <PricePills rows={n.foot.rows} />;
      break;
    case "park":
      pills = <ParkPill category={n.foot.category} distance={distance} />;
      break;
    default:
      pills = n.district ? <span className={MUTED_PILL}>{n.district}</span> : null;
  }
  // draggable={false}: iOS would otherwise start a link drag when the finger rests on the card before swiping.
  return (
    <Link href={n.href} draggable={false} className={CARD}>
      <span className="flex items-center gap-2">
        <MiniIcon icon={n.icon} tone={n.tone} />
        <span className={LABEL}>{n.label}</span>
        {right ? <span className="shrink-0 text-sm font-semibold text-muted-foreground tabular-nums">{right}</span> : null}
      </span>
      <span className={NAME}>{n.name}</span>
      <span className={PILLS}>{pills}</span>
    </Link>
  );
}

/**
 * Home "Yakınımda": what is near the user, one card each in a free-scrolling strip (all the same: kind and distance,
 * the name, a pill row that scrolls sideways on its own): the nearest Nöbetçi Eczane with today's duty hours (else the nearest eczane), durak with its next
 * buses, cami with the next prayer, taksi (driver and minimum fare), şarj, akaryakıt and kuaför (prices) and park. A
 * card opens the place's page. Client-only (the location lives on the device); the first card asks for the location
 * when there is no GPS fix. Only the rounded point is sent. `dutyMode`: app setting; `prayerDays`: today's and
 * tomorrow's prayer times (Gebze).
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
    <ul className="no-scrollbar -mx-4 flex items-stretch gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1" aria-busy={!settled}>
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
            <span className={PILLS}>
              <span className={cn(PILL, "bg-brand-soft text-primary")}>{place} merkezine göre</span>
            </span>
          </button>
        </li>
      ) : null}
      {!settled
        ? Array.from({ length: 3 }, (_, i) => (
            <li key={`bos-${i}`} className={ITEM} aria-hidden>
              <span className={cn("block animate-pulse rounded-[1.75rem] bg-card motion-reduce:animate-none", CARD_H)} />
            </li>
          ))
        : state.items?.length
          ? state.items.map((n) => (
              <li key={n.key} className={ITEM}>
                <NearestCard n={n} showDistance={gps} prayerDays={prayerDays} />
              </li>
            ))
          : (
              <li className={ITEM}>
                <Link href={routes.nearby.root()} draggable={false} className={CARD}>
                  <span className="flex items-center gap-2">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary" aria-hidden>
                      <Compass className="size-[18px]" strokeWidth={2.2} />
                    </span>
                    <span className={LABEL}>Keşfet</span>
                  </span>
                  <span className={NAME}>Haritayı aç</span>
                  <span className={PILLS}>
                    <span className={MUTED_PILL}>Yakındakiler şu an yüklenemedi</span>
                  </span>
                </Link>
              </li>
            )}
    </ul>
  );
}
