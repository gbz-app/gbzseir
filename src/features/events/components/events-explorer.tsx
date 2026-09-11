"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, CalendarPlus, ChevronRight, History, Map as MapIcon, Search, X } from "lucide-react";
import { routes } from "@/core/routes";
import { slugifyTr } from "@/core/tr";
import { Button } from "@/components/ui/button";
import { ExploreHeader, useNow } from "@/components/shared/explore-header";
import { EVENT_CATEGORIES, type EventCategory, type EventCategoryDef } from "@/features/business/lib/verticals";
import { eventDayWindow, eventInWindow, type EventWhen } from "../format";
import type { EventItem } from "../queries";
import { EventCard } from "./event-card";
import { EventChip } from "./chip";
import { EventsMap } from "./events-map";

const WHEN_CHIPS: { key: EventWhen; label: string }[] = [
  { key: "today", label: "Bugün" },
  { key: "weekend", label: "Bu hafta sonu" },
  { key: "week", label: "Bu hafta" },
];

/** Black CTA without the Button's default shadow. */
const BLACK_CTA = "bg-foreground text-background shadow-none hover:bg-foreground/90";

/** "Etkinlik oluştur": subtle white pill in the header (guests are sent to login by the wizard page). */
function CreatePill() {
  return (
    <Link
      href={routes.events.create()}
      className="inline-flex h-11 items-center gap-1.5 rounded-full bg-card pr-4 pl-3.5 text-sm font-semibold transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <CalendarPlus className="size-[1.125rem] text-primary" aria-hidden />
      Etkinlik oluştur
    </Link>
  );
}

/** Calm filter chip: same height in both rails, no icons. */
const CHIP = "h-9 px-3.5";

/** /etkinlikler in the /kesfet style: search, category and date chips, one-column photo cards and a map view. */
export function EventsExplorer({
  events,
  categories: order = EVENT_CATEGORIES,
}: {
  events: EventItem[];
  /** event_categories in admin order (vocabularies.ts), inactive ones included; orders and labels the category chips. */
  categories?: readonly EventCategoryDef[];
}) {
  const now = useNow();
  const [q, setQ] = React.useState("");
  const [cat, setCat] = React.useState<EventCategory | null>(null);
  const [when, setWhen] = React.useState<EventWhen | null>(null);
  const [freeOnly, setFreeOnly] = React.useState(false);
  const [mapOpen, setMapOpen] = React.useState(false);
  const closeMap = React.useCallback(() => setMapOpen(false), []);

  // Active categories in admin order, plus the (inactive) category of any listed event so no event is unreachable.
  const categories = React.useMemo(() => {
    const used = new Set(events.map((e) => e.category));
    const list: { key: string; label: string; icon: string | null }[] = order.filter((c) => c.active || used.has(c.key));
    for (const e of events) {
      if (!list.some((c) => c.key === e.category)) list.push({ key: e.category, label: e.category_label, icon: e.category_icon });
    }
    return list;
  }, [events, order]);

  const needle = slugifyTr(q);
  const filtered = React.useMemo(() => {
    // Date chips can only be tapped after mount, so `now` is set; it also re-runs the filter when the minute ticks over.
    const range = when && now ? eventDayWindow(when, now) : null;
    return events.filter(
      (e) =>
        (!cat || e.category === cat) &&
        (!freeOnly || e.is_free) &&
        (!range || eventInWindow(e.starts_at, e.ends_at, range)) &&
        (!needle ||
          slugifyTr(`${e.title} ${e.venue_name ?? ""} ${e.address ?? ""} ${e.neighbourhood_name ?? ""} ${e.business?.name ?? ""} ${e.category_label} ${e.organizer_name ?? ""}`).includes(
            needle,
          )),
    );
  }, [events, cat, freeOnly, when, needle, now]);

  const anyFilter = !!cat || !!when || freeOnly || !!needle;
  const clearAll = () => {
    setQ("");
    setCat(null);
    setWhen(null);
    setFreeOnly(false);
  };
  const catLabel = categories.find((c) => c.key === cat)?.label;
  const mappable = filtered.filter((e) => e.lat != null && e.lng != null);

  return (
    <div className="flex flex-col gap-5 px-4 pb-32">
      <ExploreHeader title="Etkinlikler" subtitle="Konser, tiyatro, atölye ve festivaller" right={<CreatePill />} />

      <label className="relative block">
        <span className="sr-only">Etkinliklerde ara</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Etkinlik ara: isim, yer, mahalle"
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

      <div className="flex flex-col gap-2">
        {categories.length > 0 ? (
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5" role="group" aria-label="Kategori">
            <EventChip active={!cat} onClick={() => setCat(null)} className={CHIP}>
              Tümü
            </EventChip>
            {categories.map((c) => (
              <EventChip key={c.key} active={cat === c.key} onClick={() => setCat((v) => (v === c.key ? null : c.key))} className={CHIP}>
                {c.label}
              </EventChip>
            ))}
          </div>
        ) : null}
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5" role="group" aria-label="Tarih ve ücret">
          {WHEN_CHIPS.map((w) => (
            <EventChip key={w.key} active={when === w.key} onClick={() => setWhen((v) => (v === w.key ? null : w.key))} className={CHIP}>
              {w.label}
            </EventChip>
          ))}
          <EventChip active={freeOnly} onClick={() => setFreeOnly((v) => !v)} className={CHIP}>
            Ücretsiz
          </EventChip>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl bg-card px-6 py-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-primary">
            <CalendarDays className="size-7" strokeWidth={1.75} aria-hidden />
          </span>
          <p className="mt-4 font-semibold">Yaklaşan etkinlik yok</p>
          <p className="mt-1 text-sm text-muted-foreground">Bir etkinlik mi düzenliyorsun? Ekle, onaylanınca herkes burada görsün.</p>
          <Button asChild className={`mt-5 ${BLACK_CTA}`}>
            <Link href={routes.events.create()}>
              <CalendarPlus /> Etkinlik oluştur
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex min-h-6 items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {filtered.length} etkinlik
            </p>
            {anyFilter ? (
              <button type="button" onClick={clearAll} className="-my-2 h-10 rounded-full px-2 text-sm font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                Temizle
              </button>
            ) : null}
          </div>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center rounded-3xl bg-card px-6 py-8 text-center">
              <p className="font-semibold">
                {needle ? `"${q.trim()}" için etkinlik bulunamadı` : cat && !when && !freeOnly ? `${catLabel ?? "Bu kategori"} için yaklaşan etkinlik yok` : "Bu filtrelere uygun etkinlik yok"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Başka bir gün ya da kategori dene.</p>
              <Button variant="secondary" className="mt-4 shadow-none" onClick={clearAll}>
                Filtreleri temizle
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {filtered.map((e, i) => (
                <li key={e.id}>
                  <EventCard event={e} eager={i < 2} now={now} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Link
        href={routes.events.past()}
        className="inline-flex h-11 items-center gap-1.5 self-center rounded-full px-4 text-sm font-semibold text-muted-foreground transition-colors outline-none hover:bg-card hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <History className="size-4" aria-hidden />
        Geçmiş etkinlikler
        <ChevronRight className="size-4" aria-hidden />
      </Link>

      {mappable.length > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottomnav-h)+env(safe-area-inset-bottom,0px)+1.5rem)] z-30 flex justify-center">
          <button
            type="button"
            onClick={() => setMapOpen(true)}
            className="pointer-events-auto inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background transition-transform outline-none active:scale-95 focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <MapIcon className="size-5" aria-hidden /> Harita
          </button>
        </div>
      ) : null}

      {mapOpen ? <EventsMap events={mappable} now={now} onClose={closeMap} /> : null}
    </div>
  );
}
