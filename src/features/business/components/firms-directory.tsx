"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { LocateFixed, Loader2, MapPin, Search, Star, Store, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChipFilter, type ChipOption } from "@/components/shared/chip-filter";
import { EmptyState } from "@/components/shared/empty-state";
import { useNow } from "@/components/shared/explore-header";
import { districtBySlug } from "@/config/districts";
import { distanceMeters, formatDistance } from "@/core/geo";
import { trIncludes } from "@/core/tr";
import { useApproxLocation } from "@/lib/location/use-approx-location";
import { BusinessRow, type BusinessRowData } from "./business-card";
import { DistrictFilterChip, useDistrictParam } from "./district-filter";

export type DirectoryItem = BusinessRowData & { id: string; lat: number | null; lng: number | null; keys: string[] };
export type DirectoryChip = { key: string; label: string; count: number };

type SortMode = "puan" | "mesafe";
const ALL = "__tumu";

/** F7 directory: category chips, district filter (?ilce=), name search, sort by rating or distance (location only on tap). */
export function FirmsDirectory({ items, chips }: { items: DirectoryItem[]; chips: DirectoryChip[] }) {
  const searchParams = useSearchParams();
  const [chip, setChip] = React.useState<string | null>(() => {
    const k = searchParams.get("kategori");
    return k && chips.some((c) => c.key === k) ? k : null;
  });
  const [sort, setSort] = React.useState<SortMode>(() => (searchParams.get("sirala") === "mesafe" ? "mesafe" : "puan"));
  const [query, setQuery] = React.useState("");
  const [district, setDistrict] = useDistrictParam();
  const loc = useApproxLocation();
  // Client clock for the "Tatilde" check (null before mount: the rows use the raw flag, same as the server HTML).
  const now = useNow();

  // Keep the URL shareable without a server round trip.
  React.useEffect(() => {
    const url = new URL(window.location.href);
    if (chip) url.searchParams.set("kategori", chip);
    else url.searchParams.delete("kategori");
    if (sort === "mesafe") url.searchParams.set("sirala", "mesafe");
    else url.searchParams.delete("sirala");
    const next = `${url.pathname}${url.search}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", next);
  }, [chip, sort]);

  const chooseSort = async (mode: SortMode) => {
    if (mode === "mesafe" && loc.pointSource === "city") {
      const coords = await loc.request();
      if (!coords) {
        toast.error("Konumun alınamadı. İlçeni seçerek de mesafeye göre sıralayabilirsin.");
        return;
      }
    }
    setSort(mode);
  };

  const filtered = React.useMemo(() => {
    const q = query.trim();
    return items.filter(
      (b) =>
        (!chip || b.keys.includes(chip)) &&
        (!district || b.district_id === district) &&
        (!q || trIncludes(`${b.name} ${b.category_label ?? ""} ${districtBySlug(b.district_id)?.name ?? ""}`, q)),
    );
  }, [items, chip, district, query]);

  const rows = React.useMemo(() => {
    const withDistance = filtered.map((b) => ({
      b,
      d: typeof b.lat === "number" && typeof b.lng === "number" ? distanceMeters(loc.point, { lat: b.lat, lng: b.lng }) : null,
    }));
    if (sort === "mesafe") {
      withDistance.sort((x, y) => (x.d === null ? 1 : 0) - (y.d === null ? 1 : 0) || (x.d ?? 0) - (y.d ?? 0));
    }
    return withDistance;
  }, [filtered, sort, loc.point]);

  const options: ChipOption[] = [{ value: ALL, label: "Tümü", count: items.length }, ...chips.map((c) => ({ value: c.key, label: c.label, count: c.count }))];
  const referenceDistrict = loc.pointSource === "district" ? districtBySlug(loc.district) : undefined;
  const referenceLabel = loc.pointSource === "gps" ? "Konumuna göre sıralandı" : referenceDistrict ? `${referenceDistrict.name} merkezine göre sıralandı` : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Firma adı ya da hizmet ara"
          aria-label="Firma ara"
          enterKeyHint="search"
          autoComplete="off"
          className="h-11 pl-10"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Aramayı temizle"
            className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {chips.length > 0 ? (
        <ChipFilter ariaLabel="Kategori" options={options} value={chip ?? ALL} onChange={(v) => setChip(!v || v === ALL ? null : v)} size="sm" />
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <DistrictFilterChip value={district} onChange={setDistrict} />
        <div role="radiogroup" aria-label="Sıralama" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {(
            [
              { value: "puan", label: "Puan", icon: Star },
              { value: "mesafe", label: "Mesafe", icon: MapPin },
            ] as const
          ).map((o) => {
            const active = sort === o.value;
            const busy = o.value === "mesafe" && loc.status === "locating";
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => void chooseSort(o.value)}
                className={cn(
                  "flex h-9 min-w-[5.5rem] items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <o.icon className="size-4" aria-hidden />}
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="-mt-1 text-sm font-semibold text-muted-foreground" aria-live="polite">
        {filtered.length} firma
      </p>

      {sort === "mesafe" && referenceLabel ? (
        <p className="-mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <LocateFixed className="size-3.5" aria-hidden />
          {referenceLabel}
          {loc.pointSource !== "gps" ? (
            <Button type="button" variant="link" size="sm" className="h-auto px-1 py-0 text-xs" onClick={() => void loc.request()}>
              Konumumu kullan
            </Button>
          ) : null}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={Store}
          compact
          title={items.length === 0 ? "Henüz onaylı firma yok" : "Bu aramaya uygun firma bulunamadı"}
          description={items.length === 0 ? "İşletmeler onaylandıkça burada listelenecek." : "Filtreyi temizleyip tekrar dene."}
          action={
            items.length > 0 ? (
              <Button
                variant="outline"
                onClick={() => {
                  setChip(null);
                  setDistrict(null);
                  setQuery("");
                }}
              >
                Filtreleri temizle
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map(({ b, d }) => (
            <li key={b.id}>
              <BusinessRow b={b} now={now} distanceLabel={sort === "mesafe" && d !== null ? formatDistance(d) : null} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
