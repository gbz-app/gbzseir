"use client";

import * as React from "react";
import Link from "next/link";
import { Compass, Loader2, LocateFixed } from "lucide-react";
import { formatDistance } from "@/core/geo";
import { routes } from "@/core/routes";
import { districtBySlug } from "@/config/districts";
import { CITY } from "@/config/site";
import { createClient } from "@/lib/supabase/client";
import { useApproxLocation } from "@/lib/location/use-approx-location";
import { useIsClient } from "@/lib/use-is-client";
import { districtLabel, poiHref } from "@/features/nearby/config";
import { KindIcon } from "@/features/nearby/components/kind-icon";
import { parseStopDetails } from "@/features/nearby/lib/details";
import type { PoiKind, PoiRow } from "@/features/nearby/types";

/** One card per kind: the nearest place of that kind (GPS, else the chosen district's centre, else the city centre). */
const KINDS: ReadonlyArray<{ kind: PoiKind; label: string }> = [
  { kind: "pharmacy", label: "En yakın eczane" },
  { kind: "bus_stop", label: "En yakın durak" },
  { kind: "mosque", label: "En yakın cami" },
  { kind: "taxi", label: "En yakın taksi durağı" },
  { kind: "ev_charge", label: "En yakın şarj istasyonu" },
  { kind: "fuel", label: "En yakın akaryakıt" },
];

const RADIUS_M = 25_000;
const MAX_LINES = 5;
/** Cards a bit larger than a category tile; all the same size in the sideways strip. */
const CARD = "flex h-full min-h-[9.5rem] w-full flex-col rounded-3xl bg-card p-3.5 text-left outline-none transition-transform active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/50";

type Nearest = { kind: PoiKind; label: string; row: PoiRow };

async function loadNearest(point: { lat: number; lng: number }): Promise<Nearest[]> {
  const supabase = createClient();
  const rows = await Promise.all(
    KINDS.map(async (k) => {
      const { data, error } = await supabase.rpc("nearby_pois", { p_kind: k.kind, p_lat: point.lat, p_lng: point.lng, p_radius_m: RADIUS_M, p_limit: 1 });
      if (error) throw new Error(error.message);
      const row = ((data ?? []) as unknown as PoiRow[])[0];
      return row ? { ...k, row } : null;
    }),
  );
  return rows.filter((r): r is Nearest => !!r);
}

function NearestCard({ n, showDistance }: { n: Nearest; showDistance: boolean }) {
  const r = n.row;
  const lines = r.kind === "bus_stop" ? parseStopDetails(r.details).lines : [];
  const where = showDistance && typeof r.distance_m === "number" ? formatDistance(r.distance_m) : districtLabel(r);
  return (
    <Link href={poiHref(r.kind, r.slug)} className={CARD}>
      <span className="flex items-center justify-between gap-2">
        <KindIcon kind={r.kind} size="sm" />
        {where ? <span className="min-w-0 truncate text-xs font-bold text-primary tabular-nums">{where}</span> : null}
      </span>
      <span className="mt-3 truncate text-xs font-medium text-muted-foreground">{n.label}</span>
      <span className="mt-0.5 line-clamp-2 text-sm leading-snug font-semibold">{r.name}</span>
      {lines.length ? (
        <span className="mt-auto flex flex-wrap gap-1 pt-2" aria-label={`Hatlar: ${lines.join(", ")}`}>
          {lines.slice(0, MAX_LINES).map((l) => (
            <span key={l} className="inline-flex h-6 items-center rounded-md bg-sky-100 px-1.5 text-xs font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
              {l}
            </span>
          ))}
          {lines.length > MAX_LINES ? <span className="self-center text-xs font-semibold text-muted-foreground">+{lines.length - MAX_LINES}</span> : null}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * Home "Yakınımda": what is actually near the user, one sideways card per kind (nearest eczane, durak with its lines,
 * cami, taksi durağı, şarj, akaryakıt); a card opens the place's page. Client-only (the location lives on the device);
 * the first card asks for the location when there is no GPS fix. Only the rounded point is sent (nearby_pois).
 */
export function HomeNearby() {
  const isClient = useIsClient();
  const loc = useApproxLocation();
  const { lat, lng } = loc.point;
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const [state, setState] = React.useState<{ key: string; items: Nearest[] | null }>({ key: "", items: null });

  React.useEffect(() => {
    if (!isClient) return;
    let alive = true;
    loadNearest({ lat, lng })
      .then((items) => alive && setState({ key, items }))
      .catch(() => alive && setState({ key, items: null }));
    return () => {
      alive = false;
    };
  }, [isClient, key, lat, lng]);

  const gps = loc.pointSource === "gps";
  const settled = state.key === key;
  const place = districtBySlug(loc.district)?.name ?? CITY.name;

  return (
    <ul className="no-scrollbar -mx-4 flex snap-x items-stretch gap-3 overflow-x-auto scroll-px-4 px-4 pb-1" aria-busy={!settled}>
      {isClient && !gps ? (
        <li className="w-36 shrink-0 snap-start">
          <button type="button" onClick={() => void loc.request()} disabled={loc.status === "locating"} className={CARD}>
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-primary" aria-hidden>
              {loc.status === "locating" ? <Loader2 className="size-5 animate-spin" /> : <LocateFixed className="size-5" />}
            </span>
            <span className="mt-3 text-sm leading-snug font-semibold">Konumunu kullan</span>
            <span className="mt-0.5 text-xs leading-snug text-muted-foreground">Şu an {place} merkezine göre</span>
          </button>
        </li>
      ) : null}
      {!settled
        ? Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="w-36 shrink-0" aria-hidden>
              <span className="block h-[9.5rem] animate-pulse rounded-3xl bg-card motion-reduce:animate-none" />
            </li>
          ))
        : state.items?.length
          ? state.items.map((n) => (
              <li key={n.kind} className="w-36 shrink-0 snap-start">
                <NearestCard n={n} showDistance={gps} />
              </li>
            ))
          : (
              <li className="w-36 shrink-0 snap-start">
                <Link href={routes.nearby.root()} className={CARD}>
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-primary" aria-hidden>
                    <Compass className="size-5" />
                  </span>
                  <span className="mt-3 text-sm leading-snug font-semibold">Keşfet haritası</span>
                  <span className="mt-0.5 text-xs leading-snug text-muted-foreground">Yakındaki yerler şu an yüklenemedi</span>
                </Link>
              </li>
            )}
    </ul>
  );
}
