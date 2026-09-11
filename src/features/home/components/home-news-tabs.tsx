"use client";

import * as React from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/config/site";
import { routes } from "@/core/routes";
import { orderByDefs } from "@/features/business/lib/category-visuals";
import { NEWS_CATEGORIES, newsCategoryLabel, newsVisual, type ArticleSummary, type NewsCategoryDef } from "@/features/content/articles/meta";
import type { NewsItem } from "@/features/content/news/parse";

/** One card: our article (in-app page) or an RSS headline (source site, new tab). */
type Entry = {
  key: string;
  category: string;
  title: string;
  source: string;
  publishedAt: string | null;
  href: string;
  external: boolean;
  coverUrl: string | null;
};

const CARD = "relative block h-[19rem] overflow-hidden rounded-[1.75rem] bg-linear-to-br outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function ago(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatDistanceToNow(d, { addSuffix: true, locale: tr });
}

function CardContent({ entry, categories }: { entry: Entry; categories: readonly NewsCategoryDef[] }) {
  const v = newsVisual(entry.category, categories);
  return (
    <>
      {entry.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entry.coverUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
      ) : (
        <>
          <span className="absolute -top-10 -left-10 size-36 rounded-full bg-white/10" aria-hidden />
          <span className="absolute -right-8 bottom-20 size-40 rounded-full bg-black/10" aria-hidden />
          <v.icon className="absolute top-16 left-1/2 size-14 -translate-x-1/2 text-white/90" strokeWidth={1.5} aria-hidden />
        </>
      )}
      <span className="absolute top-3 right-3 inline-flex h-7 items-center rounded-full bg-white/95 px-2.5 text-xs font-semibold text-neutral-900">
        {newsCategoryLabel(entry.category, categories)}
      </span>
      <span className="absolute inset-x-2.5 bottom-2.5 rounded-xl bg-card p-3.5">
        <span className="line-clamp-3 text-[15px] leading-snug font-semibold">{entry.title}</span>
        <span className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className={cn("truncate font-medium", !entry.external && "text-primary")}>{entry.source}</span>
          {/* The home HTML is cached, so the server's "x saat önce" can differ from the client's; like RelativeTime. */}
          <span className="shrink-0" suppressHydrationWarning>
            {ago(entry.publishedAt)}
          </span>
        </span>
      </span>
      {entry.external ? <span className="sr-only"> (kaynak sitede, yeni sekmede açılır)</span> : null}
    </>
  );
}

/**
 * Home "Haberler" tabs and cards: category tabs (Gündem, Siyaset, Spor... in admin order) and tall cards with a white
 * info card, like Gezilecek Yerler. Our own articles come first and open in the app; RSS headlines follow and open the
 * source site.
 */
export function HomeNewsTabs({
  articles = [],
  items,
  categories = NEWS_CATEGORIES,
}: {
  articles?: ArticleSummary[];
  items: NewsItem[];
  /** news_categories in admin order (getVocabularies). */
  categories?: readonly NewsCategoryDef[];
}) {
  const [tab, setTab] = React.useState<string>("tumu");
  const entries = React.useMemo<Entry[]>(
    () => [
      ...articles.map((a) => ({
        key: `a-${a.id}`,
        category: a.category,
        title: a.title,
        source: APP_NAME,
        publishedAt: a.publishedAt,
        href: routes.content.newsArticle(a.slug),
        external: false,
        coverUrl: a.coverUrl,
      })),
      ...items.map((n) => ({
        key: n.id,
        category: n.category,
        title: n.title,
        source: n.sourceName,
        publishedAt: n.publishedAt,
        href: n.url,
        external: true,
        coverUrl: null,
      })),
    ],
    [articles, items],
  );
  const keys = orderByDefs(
    entries.map((e) => e.category),
    categories,
  );
  const shown = (tab === "tumu" ? entries : entries.filter((e) => e.category === tab)).slice(0, 12);

  return (
    <div>
      <div role="tablist" aria-label="Haber türü" className="no-scrollbar -mx-4 mt-1 flex gap-5 overflow-x-auto px-4">
        {[{ value: "tumu", label: "Tümü" }, ...keys.map((c) => ({ value: c, label: newsCategoryLabel(c, categories) }))].map((c) => {
          const active = tab === c.value;
          return (
            <button
              key={c.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(c.value)}
              className={cn(
                "relative shrink-0 pb-2 text-[15px] transition-colors outline-none focus-visible:text-foreground",
                active ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {c.label}
              <span className={cn("absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground transition-opacity", active ? "opacity-100" : "opacity-0")} aria-hidden />
            </button>
          );
        })}
      </div>

      <ul className="no-scrollbar -mx-4 mt-3 flex snap-x gap-3 overflow-x-auto scroll-px-4 px-4 pb-2">
        {shown.map((e) => (
          <li key={e.key} className="w-[15.5rem] shrink-0 snap-start">
            {e.external ? (
              <a href={e.href} target="_blank" rel="noopener noreferrer" className={cn(CARD, newsVisual(e.category, categories).gradient)}>
                <CardContent entry={e} categories={categories} />
              </a>
            ) : (
              <Link href={e.href} className={cn(CARD, newsVisual(e.category, categories).gradient)}>
                <CardContent entry={e} categories={categories} />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
