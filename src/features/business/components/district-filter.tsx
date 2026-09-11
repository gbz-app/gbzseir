"use client";

import * as React from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { FilterChip } from "@/components/shared/explore-header";
import { DistrictPicker } from "@/components/shared/district-picker";
import { districtBySlug, isDistrictSlug, type DistrictSlug } from "@/config/districts";

/** URL parameter of the district filter on the business lists (?ilce=<district slug>). */
export const DISTRICT_PARAM = "ilce";

const CHANGE_EVENT = "ilce-param:change";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readParam(): DistrictSlug | null {
  const v = new URLSearchParams(window.location.search).get(DISTRICT_PARAM);
  return isDistrictSlug(v) ? v : null;
}

const readServer = () => null;

/**
 * ?ilce= of the current URL (null until mounted) and its setter. The setter only replaces the URL (hash kept, no
 * navigation), so a static (ISR) list page stays static and needs no Suspense boundary.
 */
export function useDistrictParam(): [DistrictSlug | null, (slug: DistrictSlug | null) => void] {
  const value = React.useSyncExternalStore(subscribe, readParam, readServer);
  const set = React.useCallback((slug: DistrictSlug | null) => {
    const url = new URL(window.location.href);
    if (slug) url.searchParams.set(DISTRICT_PARAM, slug);
    else url.searchParams.delete(DISTRICT_PARAM);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [value, set];
}

/** District filter chip of the business lists: opens the district sheet; "Tüm ilçeler" clears the filter. */
export function DistrictFilterChip({ value, onChange }: { value: DistrictSlug | null; onChange: (slug: DistrictSlug | null) => void }) {
  const [open, setOpen] = React.useState(false);
  const district = districtBySlug(value);
  return (
    <>
      <FilterChip active={!!district} onClick={() => setOpen(true)} icon={MapPin}>
        {district ? district.name : "Tüm ilçeler"}
        <ChevronDown className="size-3.5" aria-hidden />
      </FilterChip>
      <DistrictPicker
        showTrigger={false}
        open={open}
        onOpenChange={setOpen}
        value={value}
        onChange={(d) => onChange(d?.slug ?? null)}
        title="İlçe seç"
        description="Listeyi seçtiğin ilçeye göre daralt."
        allowClear
        clearLabel="Tüm ilçeler"
        showUseLocation
      />
    </>
  );
}
