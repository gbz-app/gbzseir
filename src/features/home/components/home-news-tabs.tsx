"use client";

import * as React from "react";
import Link from "next/link";
import { Newspaper } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { orderByDefs } from "@/features/business/lib/category-visuals";
import { ArticleCover } from "@/features/content/articles/article-ui";
import { NEWS_CATEGORIES, newsCategoryLabel, type ArticleSummary, type NewsCategoryDef } from "@/features/content/articles/meta";

function ago(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatDistanceToNow(d, { addSuffix: true, locale: tr });
}

/**
 * Home "Haberler": category tabs (admin order; shown when there are two or more) and tall cards with a white info
 * panel, like Gezilecek Yerler. Only our own stories; each opens its in-app page.
 */
export function HomeNewsTabs({
  articles = [],
  categories = NEWS_CATEGORIES,
}: {
  articles?: ArticleSummary[];
  /** news_categories in admin order (getVocabularies). */
  categories?: readonly NewsCategoryDef[];
}) {
  const [tab, setTab] = React.useState<string>("tumu");
  const keys = React.useMemo(() => orderByDefs(new Set(articles.map((a) => a.category)), categories), [articles, categories]);
  const shown = (tab === "tumu" ? articles : articles.filter((a) => a.category === tab)).slice(0, 12);

  if (!articles.length) {
    return (
      <div className="mt-2 flex items-center gap-3 rounded-3xl bg-card p-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-primary">
          <Newspaper className="size-5" aria-hidden />
        </span>
        <p className="min-w-0 text-sm text-muted-foreground">
          <span className="block font-semibold text-foreground">Henüz haber yok</span>
          Gebzem haberleri yakında burada.
        </p>
      </div>
    );
  }

  return (
    <div>
      {keys.length > 1 ? (
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
                  "relative shrink-0 pb-2 text-base transition-colors outline-none focus-visible:text-foreground",
                  active ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {c.label}
                <span className={cn("absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground transition-opacity", active ? "opacity-100" : "opacity-0")} aria-hidden />
              </button>
            );
          })}
        </div>
      ) : null}

      <ul className="no-scrollbar -mx-4 mt-3 flex snap-x gap-3 overflow-x-auto scroll-px-4 px-4 pb-2">
        {shown.map((a) => (
          <li key={a.id} className="w-[15.5rem] shrink-0 snap-start">
            <Link
              href={routes.content.newsArticle(a.slug)}
              className="relative block h-[15rem] overflow-hidden rounded-[1.75rem] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ArticleCover coverUrl={a.coverUrl} alt="" className="absolute inset-0 size-full" iconClassName="-mt-16 size-12" />
              <span className="absolute top-3 right-3 inline-flex h-7 items-center rounded-full bg-white/95 px-2.5 text-xs font-semibold text-neutral-900">
                {newsCategoryLabel(a.category, categories)}
              </span>
              <span className="absolute inset-x-2.5 bottom-2.5 rounded-[1.25rem] bg-card p-3.5">
                <span className="line-clamp-2 min-h-[2.75em] text-[17px] leading-snug font-semibold">{a.title}</span>
                {/* The home HTML is cached, so the server's "x saat önce" can differ from the client's; like RelativeTime. */}
                <span className="mt-1.5 block text-sm text-muted-foreground" suppressHydrationWarning>
                  {ago(a.publishedAt)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
