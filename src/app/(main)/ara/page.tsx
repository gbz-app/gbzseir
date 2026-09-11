import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Newspaper, Search, SearchX, Store, Tag, Wrench } from "lucide-react";
import { formatDate } from "@/core/format";
import { routes } from "@/core/routes";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { createClient } from "@/lib/supabase/server";
import { toArticleCategory } from "@/features/content/articles/meta";
import { NEWS_CATEGORY_LABELS } from "@/features/content/news/parse";
import { eventWhenShort } from "@/features/events/format";
import { listingPriceText } from "@/features/listings/format";
import { KindIcon } from "@/features/nearby/components/kind-icon";
import { poiHref } from "@/features/nearby/config";
import type { PoiKind } from "@/features/nearby/types";

export const metadata: Metadata = { title: "Ara", robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

type SearchResult = {
  listings: Array<{
    id: string;
    type: "classified" | "job";
    title: string;
    price_try: number | null;
    job_location_label: string | null;
    category_name: string | null;
    neighbourhood_name: string | null;
    thumb_url: string | null;
  }>;
  businesses: Array<{ id: string; slug: string; name: string; category_label: string | null; logo_url: string | null; neighbourhood_name: string | null }>;
  services: Array<{ id: string; slug: string; name: string; parent_id: string | null; parent_name: string | null }>;
  pois: Array<{ id: string; kind: PoiKind; slug: string; name: string; address: string | null; neighbourhood_name: string | null }>;
  events: Array<{
    id: string;
    slug: string;
    title: string;
    starts_at: string;
    ends_at: string | null;
    venue_name: string | null;
    cover_url: string | null;
    neighbourhood_name: string | null;
  }>;
  articles: Array<{ id: string; slug: string; title: string; category: string; cover_url: string | null; published_at: string }>;
};

const LIST = "divide-y overflow-hidden rounded-3xl bg-card shadow-soft ring-1 ring-foreground/[0.05]";
const ROW = "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60";

function Thumb({ url, fallback: Fallback }: { url: string | null; fallback: typeof Tag }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-soft text-primary">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <Fallback className="size-5" strokeWidth={1.75} aria-hidden />
      )}
    </span>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-semibold text-muted-foreground">{title}</h2>
      <ul className={LIST}>{children}</ul>
    </section>
  );
}

/** J1 - Genel arama (rpc global_search): hizmetler, işletmeler, ilanlar, yerler, etkinlikler, haberler. */
export default async function SearchPage({ searchParams }: Props) {
  const raw = (await searchParams).q;
  const q = typeof raw === "string" ? raw.trim().slice(0, 80) : "";
  let res: SearchResult | null = null;
  let failed = false;
  if (q.length >= 2) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("global_search", { p_q: q, p_limit: 8 });
    if (error) failed = true;
    else {
      // Missing groups (an older RPC without events / articles) read as empty.
      const d = (data ?? {}) as unknown as Partial<SearchResult>;
      res = {
        listings: d.listings ?? [],
        businesses: d.businesses ?? [],
        services: d.services ?? [],
        pois: d.pois ?? [],
        events: d.events ?? [],
        articles: d.articles ?? [],
      };
    }
  }
  const total = res
    ? res.listings.length + res.businesses.length + res.services.length + res.pois.length + res.events.length + res.articles.length
    : 0;

  return (
    <>
      <PageHeader title="Ara" backHref={routes.home()} />
      <div className="flex flex-col gap-6 px-4 pt-4 pb-8">
        <form action={routes.search()} method="get" role="search" className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <input
            name="q"
            type="search"
            defaultValue={q}
            autoFocus={!q}
            placeholder="Eczane, usta, ilan ya da etkinlik ara"
            aria-label="Ara"
            enterKeyHint="search"
            maxLength={80}
            className="h-13 w-full rounded-full bg-card pr-4 pl-12 text-base shadow-soft ring-1 ring-foreground/[0.06] outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </form>

        {!q ? (
          <EmptyState icon={Search} title="Ne arıyorsun?" description="Eczane, cami, usta, ilan, işletme, etkinlik, haber ya da gezilecek yer ara." />
        ) : q.length < 2 ? (
          <p className="text-center text-sm text-muted-foreground">Aramak için en az 2 harf yaz.</p>
        ) : failed ? (
          <EmptyState icon={SearchX} title="Arama yapılamadı" description="Bağlantını kontrol edip tekrar dene." />
        ) : total === 0 || !res ? (
          <EmptyState icon={SearchX} title={`"${q}" için sonuç yok`} description="Farklı bir kelime ya da daha kısa bir arama dene." />
        ) : (
          <>
            {res.services.length ? (
              <Group title="Hizmetler">
                {res.services.map((s) => (
                  <li key={s.id}>
                    <Link href={s.parent_id ? routes.services.request(s.slug) : routes.services.category(s.slug)} className={ROW}>
                      <Thumb url={null} fallback={Wrench} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{s.name}</span>
                        {s.parent_name ? <span className="block truncate text-xs text-muted-foreground">{s.parent_name}</span> : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </Group>
            ) : null}
            {res.businesses.length ? (
              <Group title="İşletmeler">
                {res.businesses.map((b) => (
                  <li key={b.id}>
                    <Link href={routes.businesses.detail(b.slug)} className={ROW}>
                      <Thumb url={b.logo_url} fallback={Store} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{b.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{[b.category_label, b.neighbourhood_name].filter(Boolean).join(" · ")}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </Group>
            ) : null}
            {res.listings.length ? (
              <Group title="İlanlar">
                {res.listings.map((l) => (
                  <li key={l.id}>
                    <Link href={l.type === "job" ? routes.listings.job(l.id) : routes.listings.classified(l.id)} className={ROW}>
                      <Thumb url={l.thumb_url} fallback={Tag} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{l.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[l.type === "job" ? "İş ilanı" : l.category_name, l.type === "job" ? l.job_location_label : l.neighbourhood_name].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {l.type === "classified" ? <span className="shrink-0 text-sm font-semibold tabular-nums">{listingPriceText(l.price_try)}</span> : null}
                    </Link>
                  </li>
                ))}
              </Group>
            ) : null}
            {res.pois.length ? (
              <Group title="Yerler">
                {res.pois.map((p) => (
                  <li key={p.id}>
                    <Link href={poiHref(p.kind, p.slug)} className={ROW}>
                      <KindIcon kind={p.kind} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{p.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{p.neighbourhood_name ?? p.address ?? ""}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </Group>
            ) : null}
            {res.events.length ? (
              <Group title="Etkinlikler">
                {res.events.map((e) => (
                  <li key={e.id}>
                    <Link href={routes.events.detail(e.slug)} className={ROW}>
                      <Thumb url={e.cover_url} fallback={CalendarDays} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{e.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[eventWhenShort(e.starts_at, e.ends_at), e.venue_name ?? e.neighbourhood_name].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </Group>
            ) : null}
            {res.articles.length ? (
              <Group title="Haberler">
                {res.articles.map((a) => (
                  <li key={a.id}>
                    <Link href={routes.content.newsArticle(a.slug)} className={ROW}>
                      <Thumb url={a.cover_url} fallback={Newspaper} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{a.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[NEWS_CATEGORY_LABELS[toArticleCategory(a.category)], formatDate(a.published_at)].join(" · ")}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </Group>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
