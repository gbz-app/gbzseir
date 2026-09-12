"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Map as MapIcon, Search, Store, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { districtBySlug } from "@/config/districts";
import { CITY } from "@/config/site";
import { distanceMeters, formatDistance } from "@/core/geo";
import { routes } from "@/core/routes";
import { slugifyTr } from "@/core/tr";
import { Button } from "@/components/ui/button";
import { ExploreHeader, FilterChip, useNow } from "@/components/shared/explore-header";
import { HideBottomNav } from "@/components/layout/nav-visibility";
import { GoogleMap } from "@/components/maps/google-map";
import { MAP_OPEN_BUTTON } from "@/components/maps/map-states";
import type { MapPoint } from "@/components/maps/types";
import { useApproxLocation } from "@/lib/location/use-approx-location";
import { openStatusAt, parseWorkingHours, type OpenStatus } from "../lib/hours";
import type { VerticalCard } from "../lib/vertical-queries";
import { VERTICAL_INFO, VERTICAL_SUBCATEGORIES, subcategoryMatcher, type Vertical, type VerticalSubcategory } from "../lib/verticals";
import { DoctorsExplorer, ExploreSegments, useExploreSegment } from "./doctors/doctors-explorer";
import type { DirectoryDoctor, DoctorBranch } from "./doctors/doctor-meta";
import { VenueCard, VenuePhotoFallback } from "./venue-card";

type Row = { item: VerticalCard; distance: number | null; open: OpenStatus | null };

const NOUN: Partial<Record<Vertical, string>> = { hizmet: "firma", otel: "otel", magaza: "mağaza", saglik: "işletme", dugun: "işletme", egitim: "kurum", spor: "işletme" };

const NO_SUBCATEGORIES: readonly VerticalSubcategory[] = [];

/** Yemek and Restoran share one title, "Yemek · Restoran" (owner, 12.09; no Restoran tile on the home page). */
const TITLE_SWITCH: readonly Vertical[] = ["yemek", "restoran"];

/**
 * Page title: the vertical's name, or for Yemek / Restoran both names with a bold dot between them; the page you are
 * on is black, the other one grey and a tap away (replace, so Geri still goes back to where you came from).
 */
function VerticalTitle({ vertical }: { vertical: Vertical }) {
  if (!TITLE_SWITCH.includes(vertical)) return VERTICAL_INFO[vertical].plural;
  return (
    <span className="flex items-center gap-3">
      {TITLE_SWITCH.map((v, i) => (
        <React.Fragment key={v}>
          {i ? <span aria-hidden className="size-2 shrink-0 rounded-full bg-foreground" /> : null}
          {v === vertical ? (
            <span aria-current="page">{VERTICAL_INFO[v].label}</span>
          ) : (
            <Link href={routes.businesses.vertical(v)} replace className="text-muted-foreground transition-colors hover:text-foreground">
              {VERTICAL_INFO[v].label}
            </Link>
          )}
        </React.Fragment>
      ))}
    </span>
  );
}

/** /kesfet/[tur]: search, sub-category chips, one-column photo cards and a map view of one vertical (no district filter, owner 12.09). */
export function VerticalExplorer({
  vertical,
  items,
  applicationsOpen,
  subcategories: chips,
  doctors,
  doctorBranches,
}: {
  vertical: Vertical;
  items: VerticalCard[];
  applicationsOpen: boolean;
  /** Admin-managed chips of the vertical (vocabularies.ts); the built-in list when omitted. */
  subcategories?: readonly VerticalSubcategory[];
  /** Sağlık only: doctors of the listed clinics; adds the "İşletmeler | Doktorlar" segment. */
  doctors?: DirectoryDoctor[];
  doctorBranches?: readonly DoctorBranch[];
}) {
  const info = VERTICAL_INFO[vertical];
  const [segment, setSegment] = useExploreSegment(!!doctors);
  const showDoctors = segment === "doktorlar" && !!doctors;
  const subcategories = chips ?? VERTICAL_SUBCATEGORIES[vertical] ?? NO_SUBCATEGORIES;
  const loc = useApproxLocation();
  const now = useNow();
  const [q, setQ] = React.useState("");
  const [subKey, setSubKey] = React.useState<string | null>(null);
  const [mapOpen, setMapOpen] = React.useState(false);

  const hasPoint = loc.pointSource !== "city";
  const { lat: pLat, lng: pLng } = loc.point;
  const rows = React.useMemo<Row[]>(
    () =>
      items.map((item) => ({
        item,
        distance: hasPoint && item.lat != null && item.lng != null ? distanceMeters({ lat: pLat, lng: pLng }, { lat: item.lat, lng: item.lng }) : null,
        // Tatil modu wins over the hours; hotels (no hours shown) only ever carry the tatil state.
        open: now ? openStatusAt(parseWorkingHours(item.vertical === "otel" ? null : item.working_hours), now, item) : null,
      })),
    [items, hasPoint, pLat, pLng, now],
  );

  const needle = slugifyTr(q);
  const sub = subcategories.find((s) => s.key === subKey) ?? null;
  const filtered = React.useMemo(() => {
    const active = subcategories.find((s) => s.key === subKey);
    const matches = active ? subcategoryMatcher(active) : null;
    return rows.filter(
      (r) =>
        (!needle || slugifyTr(`${r.item.name} ${r.item.category_label ?? ""} ${districtBySlug(r.item.district_id)?.name ?? ""}`).includes(needle)) &&
        (!matches || matches(`${r.item.category_label ?? ""} ${r.item.name} ${r.item.description ?? ""}`)),
    );
  }, [rows, needle, subcategories, subKey]);

  const clearAll = () => {
    setQ("");
    setSubKey(null);
  };
  // A chip alone gets its own empty message ("Kafe için henüz mekan yok").
  const emptyTitle = sub && !needle ? `${sub.label} için henüz` : null;

  const mappable = filtered.filter((r) => r.item.lat != null && r.item.lng != null);
  const noun = NOUN[vertical] ?? "mekan";

  return (
    <div className="flex flex-col gap-4 px-4 pb-32">
      <ExploreHeader title={<VerticalTitle vertical={vertical} />} subtitle={info.subtitle} />

      {doctors ? <ExploreSegments value={segment} onChange={setSegment} counts={{ isletmeler: items.length, doktorlar: doctors.length }} /> : null}

      {showDoctors ? (
        <DoctorsExplorer doctors={doctors} branches={doctorBranches} />
      ) : (
        <>
          <label className="relative block">
            <span className="sr-only">{info.plural} içinde ara</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`${info.label} ara: isim, ilçe`}
              enterKeyHint="search"
              className="h-12 w-full rounded-full bg-card pr-11 pl-12 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
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

          {subcategories.length > 0 ? (
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1" role="group" aria-label="Kategoriler">
              <FilterChip active={!sub} onClick={() => setSubKey(null)}>
                Tümü
              </FilterChip>
              {subcategories.map((s) => (
                <FilterChip key={s.key} active={sub?.key === s.key} onClick={() => setSubKey((k) => (k === s.key ? null : s.key))}>
                  {s.label}
                </FilterChip>
              ))}
            </div>
          ) : null}

          {vertical === "hizmet" ? (
            <Link
              href={routes.services.root()}
              className="flex items-center gap-3 rounded-3xl bg-red-600 p-4 text-white transition-transform outline-none hover:bg-red-700 focus-visible:ring-3 focus-visible:ring-red-600/40 active:scale-[0.99]"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                <Wrench className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="block text-base font-bold">Usta mı arıyorsun?</span>
                <span>Talebini oluştur, uygun firmalar seni arasın.</span>
              </span>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-red-600" aria-hidden>
                <ArrowUpRight className="size-5" />
              </span>
            </Link>
          ) : null}

          {items.length === 0 ? (
            <div className="flex flex-col items-center rounded-3xl bg-card px-6 py-10 text-center">
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
              </p>
              {filtered.length === 0 ? (
                <div className="rounded-3xl bg-card px-6 py-8 text-center">
                  <p className="font-semibold">{emptyTitle ? `${emptyTitle} ${noun} yok` : `Aramana uygun ${noun} bulunamadı`}</p>
                  <Button variant="outline" className="mt-4" onClick={clearAll}>
                    {sub ? "Tümünü göster" : "Aramayı temizle"}
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
        </>
      )}

      {mappable.length > 0 && !showDoctors ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottomnav-h)+env(safe-area-inset-bottom,0px)+1.5rem)] z-30 flex justify-center">
          <button type="button" onClick={() => setMapOpen(true)} className={MAP_OPEN_BUTTON}>
            <MapIcon className="size-5" aria-hidden /> Harita
          </button>
        </div>
      ) : null}

      {mapOpen && !showDoctors ? <MapView title={info.plural} rows={mappable} user={loc.coords} onClose={() => setMapOpen(false)} /> : null}
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
      <GoogleMap
        points={points}
        user={user}
        center={CITY.center}
        zoom={12}
        selectedId={selected}
        onSelect={setSelected}
        fitKey="all"
        padding={{ top: 96, right: 32, bottom: 200, left: 32 }}
        gestures="greedy"
        className="absolute inset-0"
        ariaLabel={`${title} haritada`}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
        {/* Same round button as the events map (no shadow); focus moves into the dialog, Escape or this button closes it. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Haritayı kapat"
          autoFocus
          className="pointer-events-auto flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <X className="size-5" aria-hidden />
        </button>
        <span className="pointer-events-auto rounded-full bg-card px-4 py-2.5 text-sm font-semibold">
          {title} · {rows.length}
        </span>
      </div>
      {current ? (
        <div className="absolute inset-x-0 bottom-0 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          <Link
            href={routes.businesses.detail(current.item.slug)}
            className="flex items-center gap-3 rounded-3xl bg-card p-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
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
