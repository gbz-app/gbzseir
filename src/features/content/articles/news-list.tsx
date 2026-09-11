"use client";

import * as React from "react";
import { Newspaper } from "lucide-react";
import { routes } from "@/core/routes";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { orderByDefs } from "@/features/business/lib/category-visuals";
import { EventChip } from "@/features/events/components/chip";
import { ArticleCard, ArticleRow } from "./article-ui";
import { NEWS_CATEGORIES, newsCategoryLabel, type ArticleSummary, type NewsCategoryDef } from "./meta";

const PAGE_SIZE = 20;

/** /haberler: our own stories only. Category chips (admin order, shown when there are two or more), a lead card and rows. */
export function NewsList({ articles, categories = NEWS_CATEGORIES }: { articles: ArticleSummary[]; categories?: readonly NewsCategoryDef[] }) {
  const [cat, setCat] = React.useState<string | null>(null);
  const [limit, setLimit] = React.useState(PAGE_SIZE);

  const keys = React.useMemo(() => orderByDefs(new Set(articles.map((a) => a.category)), categories), [articles, categories]);
  const filtered = cat ? articles.filter((a) => a.category === cat) : articles;
  const [lead, ...rest] = filtered;
  const shown = rest.slice(0, limit);
  const pick = (value: string | null) => {
    setCat(value);
    setLimit(PAGE_SIZE);
  };

  return (
    <>
      <PageHeader title="Haberler" subtitle="Gebzem ekibinden" backHref={routes.home()}>
        {keys.length > 1 ? (
          <div role="group" aria-label="Haber kategorisi" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5">
            <EventChip active={!cat} onClick={() => pick(null)} className="h-9 px-3.5">
              Tümü
            </EventChip>
            {keys.map((k) => (
              <EventChip key={k} active={cat === k} onClick={() => pick(cat === k ? null : k)} className="h-9 px-3.5">
                {newsCategoryLabel(k, categories)}
              </EventChip>
            ))}
          </div>
        ) : null}
      </PageHeader>

      <div className="flex flex-col gap-2.5 px-4 pt-2 pb-10">
        {lead ? (
          <>
            <ArticleCard article={lead} categories={categories} eager />
            {shown.length ? (
              <ul className="mt-1 flex flex-col gap-2.5">
                {shown.map((a) => (
                  <li key={a.id}>
                    <ArticleRow article={a} categories={categories} />
                  </li>
                ))}
              </ul>
            ) : null}
            {rest.length > limit ? (
              <button
                type="button"
                onClick={() => setLimit((l) => l + PAGE_SIZE)}
                className="mt-2 inline-flex h-11 items-center justify-center gap-1.5 self-center rounded-full bg-card px-5 text-sm font-semibold transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Daha fazla göster
                <span className="font-medium text-muted-foreground">({rest.length - limit})</span>
              </button>
            ) : null}
          </>
        ) : (
          <div className="rounded-3xl bg-card">
            <EmptyState icon={Newspaper} title="Henüz haber yok" description="Gebzem ekibinin hazırladığı haberler burada yayınlanacak." />
          </div>
        )}
      </div>
    </>
  );
}
