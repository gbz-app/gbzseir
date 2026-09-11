"use client";

import Link from "next/link";
import { ArrowLeft, Briefcase, CalendarDays, ChevronRight, Newspaper, Stethoscope, Store, Tag, Wrench, type LucideIcon } from "lucide-react";
import { formatDate } from "@/core/format";
import { routes, withQuery } from "@/core/routes";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { VacationBadge } from "@/features/business/components/vacation-badge";
import { isOnVacation } from "@/features/business/lib/hours";
import { newsCategoryLabel, toArticleCategory, type NewsCategoryDef } from "@/features/content/articles/meta";
import { eventWhenShort } from "@/features/events/format";
import { guideIcon, institutionCategoryMeta } from "@/features/guide/lib/constants";
import { listingPriceText } from "@/features/listings/format";
import { KindIcon } from "@/features/nearby/components/kind-icon";
import { KIND_META, displayStopName, placeCategoryMeta, poiHref, type PlaceCategoryDef } from "@/features/nearby/config";
import type { SearchShortcut } from "../categories";
import { POI_GROUPS, SEARCH_GROUP_LABEL, poiGroup, toSearchResults, type PoiGroup, type SearchGroup, type SearchPoi, type SearchResults } from "../query";

/** Rows per group in the "all results" view; "Tümünü gör" opens the rest. */
const PER_GROUP = 4;
const EMPTY = toSearchResults(null);

const ROW = "flex min-h-16 items-center gap-3 px-4 py-2.5 outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60";

/** Where a row is: the ilçe when the RPC sends it (Kocaeli-wide data), otherwise the mahalle. */
function area(r: { district_name?: string | null; neighbourhood_name?: string | null }): string | null {
  return r.district_name || r.neighbourhood_name || null;
}

function Thumb({ url, icon: Icon }: { url: string | null; icon: LucideIcon }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-soft text-primary">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <Icon className="size-5" strokeWidth={1.75} aria-hidden />
      )}
    </span>
  );
}

function Text({ title, sub }: { title: string; sub?: string | null }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[15px] font-medium">{title}</span>
      {sub ? <span className="block truncate text-xs text-muted-foreground">{sub}</span> : null}
    </span>
  );
}

/** Where "Tümünü gör" of a group goes: the list pages for ads, otherwise this page with ?tur=. */
function groupHref(group: SearchGroup, q: string): string {
  if (group === "ilanlar") return routes.listings.classifieds({ q });
  if (group === "is-ilanlari") return routes.listings.jobs({ q });
  return withQuery(routes.search(), { q, tur: group });
}

function Group({ title, moreHref, onPick, children }: { title: string; moreHref?: string; onPick?: () => void; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="mb-1 flex min-h-11 items-center justify-between gap-3 px-1">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {moreHref ? (
          <Link
            href={moreHref}
            onClick={onPick}
            className="-mr-1 inline-flex min-h-11 items-center gap-0.5 px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Tümünü gör <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>
      <ul className="overflow-hidden rounded-3xl bg-card py-1">{children}</ul>
    </section>
  );
}

/**
 * One poi row: kind icon (place / institution category icon when known), name, then "type · ilçe". Guide kinds
 * (kurum, ATM, banka, akaryakıt, şarj) open /kurum/<slug> through poiHref.
 */
function PoiRow({ p, placeCategories, onPick }: { p: SearchPoi; placeCategories?: readonly PlaceCategoryDef[]; onPick?: () => void }) {
  const place = p.kind === "place" ? placeCategoryMeta(p.category, placeCategories) : null;
  const inst = p.kind === "institution" ? institutionCategoryMeta(p.category) : null;
  const icon = place?.icon ?? (inst ? (p.category_icon ? guideIcon(p.category_icon, inst.icon) : inst.icon) : undefined);
  const type = place?.label ?? (inst ? p.category_label || inst.label : KIND_META[p.kind]?.label);
  return (
    <li>
      <Link href={poiHref(p.kind, p.slug)} onClick={onPick} className={ROW}>
        <KindIcon kind={p.kind} icon={icon} size="sm" className="size-11 rounded-2xl" />
        <Text
          title={p.kind === "bus_stop" ? displayStopName(p.name, p.neighbourhood_name) : p.name}
          sub={[type, area(p) ?? p.address].filter(Boolean).join(" · ")}
        />
      </Link>
    </li>
  );
}

export type SearchResultsListProps = {
  q: string;
  /** null: only the shortcuts (results still loading). */
  data: SearchResults | null;
  /** ?tur= view: this group only, every row, no "Tümünü gör". */
  focus?: SearchGroup;
  shortcuts?: readonly SearchShortcut[];
  newsCategories?: readonly NewsCategoryDef[];
  placeCategories?: readonly PlaceCategoryDef[];
  /** A result was tapped (counts the search). */
  onPick?: () => void;
};

/**
 * Grouped search results: shortcuts, işletmeler, doktorlar, hizmetler, yerler, resmî kurumlar, bankalar ve ATM'ler,
 * akaryakıt, şarj istasyonları, ilanlar, iş ilanları, etkinlikler, haberler.
 */
export function SearchResultsList({ q, data, focus, shortcuts = [], newsCategories, placeCategories, onPick }: SearchResultsListProps) {
  const d = data ?? EMPTY;
  const classifieds = d.listings.filter((l) => l.type !== "job");
  const jobs = d.listings.filter((l) => l.type === "job");
  const pois: Record<PoiGroup, SearchPoi[]> = { yerler: [], kurumlar: [], bankalar: [], akaryakit: [], sarj: [] };
  for (const p of d.pois) pois[poiGroup(p.kind)].push(p);
  const cut = <T,>(rows: T[]): T[] => (focus ? rows : rows.slice(0, PER_GROUP));
  const more = (g: SearchGroup) => (focus ? undefined : groupHref(g, q));
  const show = (g: SearchGroup, n: number) => n > 0 && (!focus || focus === g);

  const counts: Record<SearchGroup, number> = {
    isletmeler: d.businesses.length,
    doktorlar: d.doctors.length,
    hizmetler: d.services.length,
    yerler: pois.yerler.length,
    kurumlar: pois.kurumlar.length,
    bankalar: pois.bankalar.length,
    akaryakit: pois.akaryakit.length,
    sarj: pois.sarj.length,
    ilanlar: classifieds.length,
    "is-ilanlari": jobs.length,
    etkinlikler: d.events.length,
    haberler: d.articles.length,
  };

  return (
    <div className="flex flex-col gap-5">
      {focus ? (
        <Link href={routes.search(q)} className="-mb-2 inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-primary">
          <ArrowLeft className="size-4" aria-hidden /> Tüm sonuçlar
        </Link>
      ) : null}

      {!focus && shortcuts.length ? (
        <Group title="Kısayollar">
          {shortcuts.map((s) => (
            <li key={s.key}>
              <Link href={s.href} onClick={onPick} className={ROW}>
                <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl", s.tone)}>
                  <s.icon className="size-5" strokeWidth={1.75} aria-hidden />
                </span>
                <Text title={s.label} sub={s.hint} />
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </Group>
      ) : null}

      {show("isletmeler", counts.isletmeler) ? (
        <Group title={SEARCH_GROUP_LABEL.isletmeler} moreHref={more("isletmeler")} onPick={onPick}>
          {cut(d.businesses).map((b) => (
            <li key={b.id}>
              <Link href={routes.businesses.detail(b.slug)} onClick={onPick} className={ROW}>
                <Thumb url={b.logo_url} icon={Store} />
                <Text title={b.name} sub={[b.category_label, area(b)].filter(Boolean).join(" · ")} />
                {isOnVacation(b) ? <VacationBadge className="shrink-0" /> : null}
              </Link>
            </li>
          ))}
        </Group>
      ) : null}

      {show("doktorlar", counts.doktorlar) ? (
        <Group title={SEARCH_GROUP_LABEL.doktorlar} moreHref={more("doktorlar")} onPick={onPick}>
          {cut(d.doctors).map((doc) => (
            <li key={doc.id}>
              <Link href={routes.doctors.detail(doc.slug)} onClick={onPick} className={ROW}>
                <Thumb url={doc.photo_url} icon={Stethoscope} />
                <Text title={doc.display_name || `${doc.title} ${doc.name}`} sub={[doc.branch_label, doc.clinic_name].filter(Boolean).join(" · ")} />
              </Link>
            </li>
          ))}
        </Group>
      ) : null}

      {show("hizmetler", counts.hizmetler) ? (
        <Group title={SEARCH_GROUP_LABEL.hizmetler} moreHref={more("hizmetler")} onPick={onPick}>
          {cut(d.services).map((s) => (
            <li key={s.id}>
              <Link href={s.parent_id ? routes.services.request(s.slug) : routes.services.category(s.slug)} onClick={onPick} className={ROW}>
                <Thumb url={null} icon={Wrench} />
                <Text title={s.name} sub={s.parent_name ?? "Usta ve hizmet talebi"} />
              </Link>
            </li>
          ))}
        </Group>
      ) : null}

      {POI_GROUPS.map((g) =>
        show(g, counts[g]) ? (
          <Group key={g} title={SEARCH_GROUP_LABEL[g]} moreHref={more(g)} onPick={onPick}>
            {cut(pois[g]).map((p) => (
              <PoiRow key={p.id} p={p} placeCategories={placeCategories} onPick={onPick} />
            ))}
          </Group>
        ) : null,
      )}

      {show("ilanlar", counts.ilanlar) ? (
        <Group title={SEARCH_GROUP_LABEL.ilanlar} moreHref={more("ilanlar")} onPick={onPick}>
          {cut(classifieds).map((l) => (
            <li key={l.id}>
              <Link href={routes.listings.classified(l.id)} onClick={onPick} className={ROW}>
                <Thumb url={l.thumb_url} icon={Tag} />
                <Text title={l.title} sub={[l.category_name, area(l)].filter(Boolean).join(" · ")} />
                <span className="shrink-0 text-sm font-semibold tabular-nums">{listingPriceText(l.price_try)}</span>
              </Link>
            </li>
          ))}
        </Group>
      ) : null}

      {show("is-ilanlari", counts["is-ilanlari"]) ? (
        <Group title={SEARCH_GROUP_LABEL["is-ilanlari"]} moreHref={more("is-ilanlari")} onPick={onPick}>
          {cut(jobs).map((l) => (
            <li key={l.id}>
              <Link href={routes.listings.job(l.id)} onClick={onPick} className={ROW}>
                <Thumb url={l.thumb_url} icon={Briefcase} />
                <Text title={l.title} sub={[l.category_name, l.job_location_label || l.district_name].filter(Boolean).join(" · ")} />
              </Link>
            </li>
          ))}
        </Group>
      ) : null}

      {show("etkinlikler", counts.etkinlikler) ? (
        <Group title={SEARCH_GROUP_LABEL.etkinlikler} moreHref={more("etkinlikler")} onPick={onPick}>
          {cut(d.events).map((e) => (
            <li key={e.id}>
              <Link href={routes.events.detail(e.slug)} onClick={onPick} className={ROW}>
                <Thumb url={e.cover_url} icon={CalendarDays} />
                <Text title={e.title} sub={[eventWhenShort(e.starts_at, e.ends_at), e.venue_name ?? area(e)].filter(Boolean).join(" · ")} />
              </Link>
            </li>
          ))}
        </Group>
      ) : null}

      {show("haberler", counts.haberler) ? (
        <Group title={SEARCH_GROUP_LABEL.haberler} moreHref={more("haberler")} onPick={onPick}>
          {cut(d.articles).map((a) => (
            <li key={a.id}>
              <Link href={routes.content.newsArticle(a.slug)} onClick={onPick} className={ROW}>
                <Thumb url={a.cover_url} icon={Newspaper} />
                <Text title={a.title} sub={[newsCategoryLabel(toArticleCategory(a.category), newsCategories), formatDate(a.published_at)].join(" · ")} />
              </Link>
            </li>
          ))}
        </Group>
      ) : null}

      {focus && data && counts[focus] === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">Bu bölümde sonuç yok. Tüm sonuçlara dönüp bakabilirsin.</p>
      ) : null}
    </div>
  );
}

/** Placeholder rows while the first results load. */
export function SearchSkeleton({ groups = 2 }: { groups?: number }) {
  return (
    <div className="flex flex-col gap-5" aria-hidden>
      {Array.from({ length: groups }, (_, g) => (
        <div key={g}>
          <Skeleton className="mt-3 mb-4 ml-1 h-4 w-24 rounded-full" />
          <div className="flex flex-col rounded-3xl bg-card py-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex min-h-16 items-center gap-3 px-4 py-2.5">
                <Skeleton className="size-11 shrink-0 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-3/5 rounded-full" />
                  <Skeleton className="h-3 w-2/5 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
