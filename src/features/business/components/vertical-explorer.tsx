"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Clock, LocateFixed, Map as MapIcon, Search, Store, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CITY } from "@/config/site";
import { distanceMeters, formatDistance } from "@/core/geo";
import { routes } from "@/core/routes";
import { slugifyTr } from "@/core/tr";
import { Button } from "@/components/ui/button";
import { ExploreHeader, FilterChip, ROUND_ICON_BUTTON, useNow } from "@/components/shared/explore-header";
import { HideBottomNav } from "@/components/layout/nav-visibility";
import { LazyNearbyMap } from "@/features/nearby/map/lazy-map";
import type { MapPoint } from "@/features/nearby/map/types";
import { useApproxLocation } from "@/lib/location/use-approx-location";
import { openStatusAt, parseWorkingHours, type OpenStatus } from "../lib/hours";
import type { VerticalCard } from "../lib/vertical-queries";
import { AMENITIES, VERTICAL_INFO, type Vertical } from "../lib/verticals";
import { VenueCard, VenuePhotoFallback } from "./venue-card";

type Row = { item: VerticalCard; distance: number | null; open: OpenStatus | null };

const NOUN: Partial<Record<Vertical, string>> = { hizmet: "firma", otel: "otel", magaza: "mağaza" };

/** /kesfet/[tur]: search, chips, big photo cards and a map view of one vertical. */
export function VerticalExplorer({ vertical, items, applicationsOpen }: { vertical: Vertical; items: VerticalCard[]; applicationsOpen: boolean }) {
  const info = VERTICAL_INFO[vertical];
  const loc = useApproxLocation();
  const now = useNow();
  const [q, setQ] = React.useState("");
  const [openNow, setOpenNow] = React.useState(false);
  const [nearSort, setNearSort] = React.useState(false);
  const [amenity, setAmenity] = React.useState<string | null>(null);
  const [mapOpen, setMapOpen] = React.useState(false);

  const hasPoint = loc.pointSource !== "city";
  const { lat: pLat, lng: pLng } = loc.point;
  const rows = React.useMemo<Row[]>(
    () =>
      items.map((item) => ({
        item,
        distance: hasPoint && item.lat != null && item.lng != null ? distanceMeters({ lat: pLat, lng: pLng }, { lat: item.lat, lng: item.lng }) : null,
        open: now && item.vertical !== "otel" ? openStatusAt(parseWorkingHours(item.working_hours), now) : null,
      })),
    [items, hasPoint, pLat, pLng, now],
  );

  // Amenity chips: the most common amenities in this list (max 5).
  const amenityChips = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) for (const a of it.amenities) if (AMENITIES[a]) counts.set(a, (counts.get(a) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key]) => ({ key, label: AMENITIES[key].label, icon: AMENITIES[key].icon }));
  }, [items]);

  const needle = slugifyTr(q);
  const filtered = React.useMemo(() => {
    let out = rows.filter(
      (r) =>
        (!needle || slugifyTr(`${r.item.name} ${r.item.category_label ?? ""} ${r.item.neighbourhood_name ?? ""}`).includes(needle)) &&
        (!openNow || (!r.item.vacation_mode && (r.item.vertical === "otel" || (!!r.open?.known && r.open.open)))) &&
        (!amenity || r.item.amenities.includes(amenity)),
    );
    if (nearSort) out = [...out].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    return out;
  }, [rows, needle, openNow, amenity, nearSort]);

  const anyFilter = !!needle || openNow || nearSort || !!amenity;
  const clearAll = () => {
    setQ("");
    setOpenNow(false);
    setNearSort(false);
    setAmenity(null);
  };

  const toggleNear = async () => {
    if (nearSort) return setNearSort(false);
    if (!hasPoint) await loc.request();
    setNearSort(true);
  };

  const mappable = filtered.filter((r) => r.item.lat != null && r.item.lng != null);
  const noun = NOUN[vertical] ?? "mekan";

  return (
    <div className="flex flex-col gap-4 px-4 pb-32">
      <ExploreHeader title={info.plural} subtitle={info.subtitle} />

      <label className="relative block">
        <span className="sr-only">{info.plural} içinde ara</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`${info.label} ara: isim, mahalle`}
          enterKeyHint="search"
          className="h-12 w-full rounded-full bg-card pr-11 pl-12 text-[15px] shadow-soft ring-1 ring-foreground/[0.06] outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Aramayı temizle"
            className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </label>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1" role="group" aria-label="Filtreler">
        <FilterChip active={!anyFilter} onClick={clearAll}>
          Tümü
        </FilterChip>
        {vertical !== "otel" ? (
          <FilterChip active={openNow} onClick={() => setOpenNow((v) => !v)} icon={Clock}>
            Şimdi açık
          </FilterChip>
        ) : null}
        <FilterChip active={nearSort} onClick={toggleNear} icon={LocateFixed}>
          {loc.status === "locating" ? "Konum alınıyor…" : "Yakınımda"}
        </FilterChip>
        {amenityChips.map((a) => (
          <FilterChip key={a.key} active={amenity === a.key} onClick={() => setAmenity((v) => (v === a.key ? null : a.key))} icon={a.icon}>
            {a.label}
          </FilterChip>
        ))}
      </div>

      {vertical === "hizmet" ? (
        <Link
          href={routes.services.root()}
          className="flex items-center gap-3 rounded-3xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.05] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-primary">
            <Wrench className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-semibold">Usta mı arıyorsun?</span>
            <span className="text-muted-foreground">Talebini oluştur, uygun firmalar seni arasın.</span>
          </span>
          <ArrowUpRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      ) : null}

      {items.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl bg-card px-6 py-10 text-center shadow-soft ring-1 ring-foreground/[0.05]">
          <span className={cn("flex size-14 items-center justify-center rounded-2xl", info.tone)}>
            <info.icon className="size-7" strokeWidth={1.75} aria-hidden />
          </span>
          <p className="mt-4 font-semibold">Bu kategoride henüz işletme yok</p>
          <p className="mt-1 text-sm text-muted-foreground">Yeni işletmeler yakında burada listelenecek.</p>
          {applicationsOpen ? (
            <Button asChild className="mt-5">
              <Link href={routes.business.intro()}>
                <Store /> İşletme sayfası aç
              </Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {filtered.length} {noun}
            {nearSort && hasPoint ? " · yakından uzağa" : ""}
          </p>
          {filtered.length === 0 ? (
            <div className="rounded-3xl bg-card px-6 py-8 text-center shadow-soft ring-1 ring-foreground/[0.05]">
              <p className="font-semibold">Aramana uygun {noun} bulunamadı</p>
              <Button variant="outline" className="mt-4" onClick={clearAll}>
                Filtreleri temizle
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {filtered.map((r, i) => (
                <li key={r.item.id}>
                  <VenueCard item={r.item} distance={r.distance} open={r.open} eager={i < 2} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {mappable.length > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottomnav-h)+env(safe-area-inset-bottom,0px)+1.5rem)] z-30 flex justify-center">
          <button
            type="button"
            onClick={() => setMapOpen(true)}
            className="pointer-events-auto inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background shadow-float outline-none active:scale-95 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <MapIcon className="size-5" aria-hidden /> Harita
          </button>
        </div>
      ) : null}

      {mapOpen ? <MapView title={info.plural} rows={mappable} user={loc.coords} onClose={() => setMapOpen(false)} /> : null}
    </div>
  );
}

function MapView({ title, rows, user, onClose }: { title: string; rows: Row[]; user: { lat: number; lng: number } | null; onClose: () => void }) {
  const [selected, setSelected] = React.useState<string | null>(rows[0]?.item.id ?? null);
  const points = React.useMemo<MapPoint[]>(() => rows.map((r) => ({ id: r.item.id, lat: r.item.lat!, lng: r.item.lng!, kind: "business", label: r.item.name })), [rows]);
  const current = rows.find((r) => r.item.id === selected) ?? null;

  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] bg-background" role="dialog" aria-modal="true" aria-label={`${title} haritası`}>
      <HideBottomNav />
      <LazyNearbyMap
        points={points}
        user={user}
        center={CITY.center}
        zoom={12.5}
        selectedId={selected}
        onSelect={setSelected}
        fitKey="all"
        padding={{ top: 96, right: 32, bottom: 200, left: 32 }}
        className="absolute inset-0"
        ariaLabel={`${title} haritada`}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
        <button type="button" onClick={onClose} aria-label="Haritayı kapat" className={cn(ROUND_ICON_BUTTON, "pointer-events-auto")}>
          <X className="size-5" />
        </button>
        <span className="pointer-events-auto rounded-full bg-card px-4 py-2.5 text-sm font-semibold shadow-soft ring-1 ring-foreground/[0.06]">
          {title} · {rows.length}
        </span>
      </div>
      {current ? (
        <div className="absolute inset-x-0 bottom-0 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          <Link
            href={routes.businesses.detail(current.item.slug)}
            className="flex items-center gap-3 rounded-3xl bg-card p-2.5 shadow-float ring-1 ring-foreground/[0.06] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-muted">
              {current.item.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={current.item.photo_url} alt="" className="size-full object-cover" />
              ) : (
                <VenuePhotoFallback vertical={current.item.vertical} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{current.item.name}</span>
              <span className="block truncate text-sm text-muted-foreground">
                {[current.item.category_label, current.distance != null ? formatDistance(current.distance) : null].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="mr-1 flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background" aria-hidden>
              <ArrowUpRight className="size-5" />
            </span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
