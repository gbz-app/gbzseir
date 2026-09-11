"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronRight, Search, SearchX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { trNormalize } from "@/core/tr";
import { COMING_SOON_LABEL } from "../labels";
import type { ServicePickerData, ServicePickerItem } from "../types";
import { ServiceIconBubble } from "./service-icon";

export const PICK_STEP_TITLE = "Hangi hizmete ihtiyacın var?";
export const PICK_STEP_HELP = "Ara ya da listeden seç. Birkaç kısa soruyu cevapla, uygun firmalar seninle ilgilensin. Ücretsiz.";

/** Parent category offered when the search finds nothing. */
const OTHER_GROUP = "diger-hizmetler";

type Indexed = ServicePickerItem & { normName: string; normAll: string };

function rank(item: Indexed, q: string, words: string[]): number {
  if (!words.every((w) => item.normAll.includes(w))) return -1;
  if (item.normName.startsWith(q)) return 0;
  if (item.normName.includes(q)) return 1;
  if (words.every((w) => item.normName.includes(w))) return 2;
  return 3;
}

export type ServicePickerProps = {
  data: ServicePickerData;
  /** Wizard URL of a service (the request continues there). */
  hrefFor: (slug: string) => string;
  /** Service of the open wizard: highlighted, and tapping it calls onSelectedClick instead of navigating. */
  selectedSlug?: string;
  onSelectedClick?: () => void;
};

/**
 * Step 1 of the service request: pick a sub-category. Turkish-insensitive search over names, synonyms and parent
 * names; while the query is empty it shows the popular services and every group (accordion). Rendered on
 * /hizmetler (RequestStart) and as the first wizard step of a request started there.
 */
export function ServicePicker({ data, hrefFor, selectedSlug, onSelectedClick }: ServicePickerProps) {
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [openGroup, setOpenGroup] = React.useState(() => data.items.find((i) => i.slug === selectedSlug)?.parentSlug ?? "");

  const groupNames = React.useMemo(() => new Map(data.groups.map((g) => [g.slug, g.name])), [data.groups]);
  const byGroup = React.useMemo(() => {
    const m = new Map<string, ServicePickerItem[]>();
    for (const it of data.items) m.set(it.parentSlug, [...(m.get(it.parentSlug) ?? []), it]);
    return m;
  }, [data.items]);
  const popular = React.useMemo(() => data.items.filter((i) => i.popular), [data.items]);
  const indexed = React.useMemo<Indexed[]>(
    () => data.items.map((it) => ({ ...it, normName: trNormalize(it.name), normAll: trNormalize([it.name, ...it.terms].join(" ")) })),
    [data.items],
  );

  const q = trNormalize(query);
  const results = React.useMemo(() => {
    if (!q) return [];
    const words = q.split(" ").filter(Boolean);
    return indexed
      .map((it) => ({ it, r: rank(it, q, words) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r)
      .slice(0, 20)
      .map((x) => x.it);
  }, [indexed, q]);

  const linkProps = (slug: string) => ({ href: hrefFor(slug), selected: slug === selectedSlug, onSelectedClick });

  return (
    <div className="flex flex-col gap-6">
      <div role="search" className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Inside the wizard <form>: Enter only closes the keyboard, it must not submit the step.
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          placeholder="Örn. ev temizliği, kombi, nakliyat"
          aria-label="Hizmet ara"
          enterKeyHint="search"
          autoComplete="off"
          className="h-14 w-full rounded-full bg-card pr-12 pl-12 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Aramayı temizle"
            className="absolute top-1/2 right-1.5 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite">
        {q ? (results.length ? `${results.length} hizmet bulundu` : "Sonuç bulunamadı") : ""}
      </p>

      {q ? (
        results.length ? (
          <section aria-label="Arama sonuçları">
            <p className="mb-2 text-sm font-medium text-muted-foreground">{results.length} hizmet bulundu</p>
            <ul className="divide-y overflow-hidden rounded-3xl bg-card">
              {results.map((r) => (
                <li key={r.slug}>
                  <ServiceLink {...linkProps(r.slug)} className="min-h-16 px-4 py-3">
                    <ServiceIconBubble name={r.icon} size="sm" className={r.slug === selectedSlug ? "bg-card" : undefined} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{r.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{groupNames.get(r.parentSlug)}</span>
                    </span>
                    {r.comingSoon ? <SoonBadge /> : null}
                  </ServiceLink>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-card px-6 py-10 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <SearchX className="size-7" aria-hidden />
            </span>
            <p className="font-bold text-balance">&quot;{query.trim()}&quot; için bir hizmet bulamadık</p>
            <p className="max-w-xs text-sm text-muted-foreground">Farklı bir kelime dene ya da listeden seç.</p>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              <Button type="button" variant="outline" onClick={() => setQuery("")}>
                Tüm hizmetler
              </Button>
              {byGroup.has(OTHER_GROUP) ? (
                <Button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setOpenGroup(OTHER_GROUP);
                  }}
                >
                  Diğer hizmetler
                </Button>
              ) : null}
            </div>
          </div>
        )
      ) : (
        <>
          {popular.length ? (
            <section aria-labelledby="hizmet-populer">
              <h3 id="hizmet-populer" className="mb-3 text-base font-bold">
                Popüler
              </h3>
              <ul className="grid grid-cols-2 gap-3">
                {popular.map((s) => (
                  <li key={s.slug}>
                    <ServiceLink {...linkProps(s.slug)} tile className="h-full min-h-18 rounded-3xl p-3">
                      <ServiceIconBubble name={s.icon} size="sm" className={s.slug === selectedSlug ? "bg-card" : undefined} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-snug font-bold text-balance">{s.name}</span>
                        {s.comingSoon ? <SoonBadge className="mt-1" /> : null}
                      </span>
                    </ServiceLink>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="hizmet-kategoriler">
            <h3 id="hizmet-kategoriler" className="mb-3 text-base font-bold">
              Tüm hizmetler
            </h3>
            <Accordion type="single" collapsible value={openGroup} onValueChange={setOpenGroup} className="overflow-hidden rounded-3xl bg-card">
              {data.groups.map((g) => (
                <AccordionItem key={g.slug} value={g.slug} className="px-4">
                  <AccordionTrigger className="min-h-16 items-center gap-3 py-3 hover:no-underline">
                    <ServiceIconBubble name={g.icon} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold">{g.name}</span>
                      {g.description ? <span className="block truncate text-xs font-normal text-muted-foreground">{g.description}</span> : null}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <ul className="flex flex-col">
                      {(byGroup.get(g.slug) ?? []).map((s) => (
                        <li key={s.slug}>
                          <ServiceLink {...linkProps(s.slug)} className="-mx-2 min-h-12 rounded-xl px-2 !no-underline">
                            <span className="min-w-0 flex-1 text-[15px] font-medium text-foreground">{s.name}</span>
                            {s.comingSoon ? <SoonBadge /> : null}
                          </ServiceLink>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        </>
      )}
    </div>
  );
}

/** No approved firm serves it yet; the request can still be sent (the team looks for a firm). */
function SoonBadge({ className }: { className?: string }) {
  return (
    <Badge variant="secondary" className={className}>
      {COMING_SOON_LABEL}
    </Badge>
  );
}

/** One pickable service: a link to its wizard; the selected one is tinted, shows a check and continues in place. */
function ServiceLink({
  href,
  selected,
  onSelectedClick,
  tile,
  className,
  children,
}: {
  href: string;
  selected: boolean;
  onSelectedClick?: () => void;
  /** Popular grid tile (no trailing chevron). */
  tile?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      onClick={
        selected && onSelectedClick
          ? (e) => {
              e.preventDefault();
              onSelectedClick();
            }
          : undefined
      }
      className={cn(
        "flex items-center gap-3 transition-[background-color,transform] outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        tile ? "bg-card active:scale-[0.98]" : "focus-visible:ring-inset",
        selected ? "bg-brand-soft" : "hover:bg-muted/60",
        className,
      )}
    >
      {children}
      {selected ? (
        <Check className="size-5 shrink-0 text-primary" aria-label="Seçili" />
      ) : tile ? null : (
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      )}
    </Link>
  );
}
