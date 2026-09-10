"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChipFilter, type ChipOption } from "@/components/shared/chip-filter";
import { NEWS_CATEGORY_LABELS, NEWS_CATEGORY_ORDER, type NewsCategory, type NewsItem } from "./parse";
import { HeadlineCard, NewsRow } from "./news-ui";

const PAGE_SIZE = 25;

type Filter = "all" | NewsCategory;

/** Manşet: among the newest few, prefer a Gebze-region story with a summary. */
function pickHeadline(items: NewsItem[]): NewsItem | undefined {
  const head = items.slice(0, 8);
  return head.find((i) => i.local && i.summary) ?? head.find((i) => i.summary) ?? items[0];
}

/** I1 list: category chips, a big first card and the remaining headlines (paged on the client). */
export function NewsFeed({ items }: { items: NewsItem[] }) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [limit, setLimit] = React.useState(PAGE_SIZE);

  const options = React.useMemo<ChipOption<Filter>[]>(() => {
    const counts = new Map<NewsCategory, number>();
    for (const item of items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    return [
      { value: "all", label: "Tümü", count: items.length },
      ...NEWS_CATEGORY_ORDER.filter((c) => (counts.get(c) ?? 0) > 0).map((c) => ({ value: c, label: NEWS_CATEGORY_LABELS[c], count: counts.get(c) })),
    ];
  }, [items]);

  const filtered = filter === "all" ? items : items.filter((i) => i.category === filter);
  const headline = pickHeadline(filtered);
  const rest = filtered.filter((i) => i !== headline);
  const shown = rest.slice(0, limit);

  return (
    <div className="flex flex-col gap-4">
      {options.length > 2 ? (
        <ChipFilter
          options={options}
          value={filter}
          onChange={(v) => {
            if (!v) return;
            setFilter(v);
            setLimit(PAGE_SIZE);
          }}
          ariaLabel="Haber kategorisi"
          size="sm"
        />
      ) : null}

      {headline ? <HeadlineCard item={headline} /> : null}

      {shown.length ? (
        <section aria-label="Diğer başlıklar">
          <ul className="divide-y rounded-2xl bg-card px-4 shadow-soft ring-1 ring-foreground/[0.06]">
            {shown.map((item) => (
              <li key={item.id}>
                <NewsRow item={item} showCategory={filter === "all"} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {rest.length > limit ? (
        <Button variant="outline" className="w-full" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
          <ChevronDown aria-hidden />
          Daha fazla göster
          <span className="font-medium text-muted-foreground">({rest.length - limit})</span>
        </Button>
      ) : null}
    </div>
  );
}
