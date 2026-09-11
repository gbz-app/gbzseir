"use client";

import * as React from "react";
import { Search, Stethoscope, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { slugifyTr } from "@/core/tr";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/shared/explore-header";
import { districtBySlug, type DistrictSlug } from "@/config/districts";
import { DistrictFilterChip } from "../district-filter";
import { DoctorCard } from "./doctor-card";
import { DOCTOR_BRANCHES, branchIcon, branchLabel, findBranch, type DirectoryDoctor, type DoctorBranch } from "./doctor-meta";

// ---------------------------------------------------------------------------
// "İşletmeler | Doktorlar" segment of /kesfet/saglik. Kept in the URL hash (#doktorlar) so back from a clinic page
// returns to the doctor list; no navigation, the page stays static (ISR).
// ---------------------------------------------------------------------------
export type ExploreSegment = "isletmeler" | "doktorlar";

const SEGMENT_EVENT = "kesfet-segment:hash";
const DOCTORS_HASH = "#doktorlar";

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener(SEGMENT_EVENT, onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener(SEGMENT_EVENT, onChange);
  };
}

const readDoctorsHash = () => window.location.hash === DOCTORS_HASH;
const serverDoctorsHash = () => false;

/** Active segment ("isletmeler" until mounted, and whenever `enabled` is false) and its setter. */
export function useExploreSegment(enabled: boolean): [ExploreSegment, (segment: ExploreSegment) => void] {
  const doctorsHash = React.useSyncExternalStore(subscribeHash, readDoctorsHash, serverDoctorsHash);
  const set = React.useCallback((segment: ExploreSegment) => {
    const { pathname, search } = window.location;
    window.history.replaceState(null, "", segment === "doktorlar" ? `${pathname}${search}${DOCTORS_HASH}` : `${pathname}${search}`);
    window.dispatchEvent(new Event(SEGMENT_EVENT));
  }, []);
  return [enabled && doctorsHash ? "doktorlar" : "isletmeler", set];
}

/** Two-option segmented control (white pill, black active half). */
export function ExploreSegments({ value, onChange, counts }: { value: ExploreSegment; onChange: (s: ExploreSegment) => void; counts: Record<ExploreSegment, number> }) {
  const options: Array<{ id: ExploreSegment; label: string }> = [
    { id: "isletmeler", label: "İşletmeler" },
    { id: "doktorlar", label: "Doktorlar" },
  ];
  return (
    <div role="group" aria-label="Liste türü" className="grid grid-cols-2 gap-1 rounded-full bg-card p-1">
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(o.id)}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              selected ? "bg-foreground text-background" : "text-foreground/75 hover:text-foreground",
            )}
          >
            {o.label}
            <span className={cn("text-xs tabular-nums", selected ? "text-background/70" : "text-muted-foreground")}>{counts[o.id]}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Doctors list: search, branch chips (horizontal rail), the clinic's district filter (shared with the İşletmeler segment
// through ?ilce=), two-column cards linking to each doctor's profile page.
// ---------------------------------------------------------------------------
export function DoctorsExplorer({
  doctors,
  branches = DOCTOR_BRANCHES,
  district = null,
  onDistrictChange,
}: {
  doctors: DirectoryDoctor[];
  branches?: readonly DoctorBranch[];
  /** Clinic district filter; the chip shows only with `onDistrictChange`. */
  district?: DistrictSlug | null;
  onDistrictChange?: (slug: DistrictSlug | null) => void;
}) {
  const [q, setQ] = React.useState("");
  const [branchKey, setBranchKey] = React.useState<string | null>(null);

  // Only branches somebody works in, in the vocabulary order.
  const chips = React.useMemo<DoctorBranch[]>(() => {
    const used = new Set(doctors.map((d) => d.branch));
    const known = branches.filter((b) => used.has(b.key));
    const unknown = [...used].filter((k) => !branches.some((b) => b.key === k)).map((k) => findBranch(k) ?? { key: k, label: k, icon: null, active: true });
    return [...known, ...unknown];
  }, [doctors, branches]);

  const needle = slugifyTr(q);
  const filtered = React.useMemo(
    () =>
      doctors.filter(
        (d) =>
          (!branchKey || d.branch === branchKey) &&
          (!district || d.clinic.district_id === district) &&
          (!needle ||
            slugifyTr(`${d.title} ${d.name} ${branchLabel(d.branch, branches)} ${d.clinic.name} ${districtBySlug(d.clinic.district_id)?.name ?? ""}`).includes(needle)),
      ),
    [doctors, branches, branchKey, district, needle],
  );
  const activeChip = chips.find((c) => c.key === branchKey) ?? null;
  const districtInfo = districtBySlug(district);

  const clearAll = () => {
    setQ("");
    setBranchKey(null);
    onDistrictChange?.(null);
  };
  // One filter alone gets its own empty message.
  const emptyTitle =
    activeChip && !needle && !districtInfo
      ? `${activeChip.label} için henüz doktor yok`
      : districtInfo && !needle && !activeChip
        ? `${districtInfo.name} için henüz doktor yok`
        : "Aramana uygun doktor bulunamadı";

  return (
    <>
      <label className="relative block">
        <span className="sr-only">Doktorlar içinde ara</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Doktor ara: isim, branş, klinik"
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

      {chips.length > 1 ? (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1" role="group" aria-label="Branşlar">
          <FilterChip active={!activeChip} onClick={() => setBranchKey(null)}>
            Tümü
          </FilterChip>
          {chips.map((c) => (
            <FilterChip key={c.key} active={activeChip?.key === c.key} onClick={() => setBranchKey((k) => (k === c.key ? null : c.key))} icon={branchIcon(c.icon)}>
              {c.label}
            </FilterChip>
          ))}
        </div>
      ) : null}

      {doctors.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl bg-card px-6 py-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-primary">
            <Stethoscope className="size-7" strokeWidth={1.75} aria-hidden />
          </span>
          <p className="mt-4 font-semibold">Henüz doktor eklenmedi</p>
          <p className="mt-1 text-sm text-muted-foreground">Klinikler doktorlarını ekledikçe burada görünecek.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {filtered.length} doktor
            </p>
            {onDistrictChange ? <DistrictFilterChip value={district} onChange={onDistrictChange} /> : null}
          </div>
          {filtered.length === 0 ? (
            <div className="rounded-3xl bg-card px-6 py-8 text-center">
              <p className="font-semibold">{emptyTitle}</p>
              <Button variant="outline" className="mt-4" onClick={clearAll}>
                {activeChip || districtInfo ? "Tümünü göster" : "Aramayı temizle"}
              </Button>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3">
              {filtered.map((d) => (
                <li key={d.id}>
                  <DoctorCard
                    doctor={d}
                    branches={branches}
                    href={d.slug ? routes.doctors.detail(d.slug) : `${routes.businesses.detail(d.clinic.slug)}${DOCTORS_HASH}`}
                    meta={[d.clinic.name, districtBySlug(d.clinic.district_id)?.name].filter(Boolean).join(" · ")}
                  />
                </li>
              ))}
            </ul>
          )}
          <p className="px-1 text-xs leading-relaxed text-muted-foreground">Bilgiler klinikler tarafından girilir. Randevu için doktorun çalıştığı kliniği ara.</p>
        </>
      )}
    </>
  );
}
