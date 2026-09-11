"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { Building2, Landmark, Megaphone, Newspaper, Ticket, Trophy, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { NEWS_CATEGORY_LABELS, NEWS_CATEGORY_ORDER, type NewsCategory, type NewsItem } from "@/features/content/news/parse";

const VISUAL: Record<NewsCategory, { icon: LucideIcon; gradient: string }> = {
  gundem: { icon: Newspaper, gradient: "from-sky-500 via-blue-500 to-indigo-600" },
  siyaset: { icon: Landmark, gradient: "from-rose-500 via-red-500 to-orange-500" },
  belediye: { icon: Building2, gradient: "from-violet-500 via-purple-500 to-indigo-700" },
  spor: { icon: Trophy, gradient: "from-emerald-500 via-green-500 to-teal-600" },
  etkinlik: { icon: Ticket, gradient: "from-fuchsia-500 via-pink-500 to-rose-500" },
  duyuru: { icon: Megaphone, gradient: "from-amber-500 via-orange-500 to-red-500" },
};

function ago(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatDistanceToNow(d, { addSuffix: true, locale: tr });
}

/** Home "Haberler": category tabs (Gündem, Siyaset, Spor...) and tall cards with a white info card, like Gezilecek Yerler. */
export function HomeNews({ items }: { items: NewsItem[] }) {
  const [tab, setTab] = React.useState<NewsCategory | "tumu">("tumu");
  const categories = NEWS_CATEGORY_ORDER.filter((c) => items.some((i) => i.category === c));
  const shown = (tab === "tumu" ? items : items.filter((i) => i.category === tab)).slice(0, 10);

  return (
    <div>
      <div role="tablist" aria-label="Haber türü" className="no-scrollbar -mx-4 mt-1 flex gap-5 overflow-x-auto px-4">
        {[{ value: "tumu" as const, label: "Tümü" }, ...categories.map((c) => ({ value: c, label: NEWS_CATEGORY_LABELS[c] }))].map((c) => {
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
        {shown.map((n) => {
          const v = VISUAL[n.category];
          return (
            <li key={n.id} className="w-[15.5rem] shrink-0 snap-start">
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn("relative block h-[19rem] overflow-hidden rounded-[1.75rem] bg-linear-to-br outline-none focus-visible:ring-3 focus-visible:ring-ring/50", v.gradient)}
              >
                <span className="absolute -top-10 -left-10 size-36 rounded-full bg-white/10" aria-hidden />
                <span className="absolute -right-8 bottom-20 size-40 rounded-full bg-black/10" aria-hidden />
                <v.icon className="absolute top-16 left-1/2 size-14 -translate-x-1/2 text-white/90" strokeWidth={1.5} aria-hidden />
                <span className="absolute top-3 right-3 inline-flex h-7 items-center rounded-full bg-white/95 px-2.5 text-xs font-semibold text-neutral-900">
                  {NEWS_CATEGORY_LABELS[n.category]}
                </span>
                <span className="absolute inset-x-2.5 bottom-2.5 rounded-xl bg-card p-3.5">
                  <span className="line-clamp-3 text-[15px] leading-snug font-semibold">{n.title}</span>
                  <span className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate font-medium">{n.sourceName}</span>
                    <span className="shrink-0">{ago(n.publishedAt)}</span>
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
