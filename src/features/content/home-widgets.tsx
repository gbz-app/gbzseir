import Link from "next/link";
import { Newspaper } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/shared/section-header";
import { routes } from "@/core/routes";
import { getVocabularies } from "@/features/business/lib/vocabularies";
import { getNews } from "./news/get-news";
import { NewsRow } from "./news/news-ui";
import { getActiveAnnouncements } from "./announcements/get-announcements";
import { AnnouncementsStripClient } from "./announcements/announcements-strip";

/**
 * Home widget (server): 3-5 newest "Gebze Gündemi" headlines + "Tümü".
 * Shares the cached feed data with /haberler. Shows a small note instead of failing when feeds are down.
 */
export async function LatestNewsList({ limit = 4, className }: { limit?: number; className?: string }) {
  // Admin labels of the news categories (cached; built-in labels when they cannot be read).
  const [{ items }, { newsCategories }] = await Promise.all([getNews(), getVocabularies()]);
  const top = items.slice(0, Math.min(5, Math.max(3, limit)));

  return (
    <section aria-label="Kocaeli Gündemi" className={className}>
      <SectionHeader title="Kocaeli Gündemi" description="Yerel kaynaklardan son başlıklar" href={routes.content.news()} />
      {top.length ? (
        <ul className="mt-2 divide-y rounded-2xl bg-card px-4 shadow-soft ring-1 ring-foreground/[0.06]">
          {top.map((item) => (
            <li key={item.id}>
              <NewsRow item={item} categories={newsCategories} compact />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-2 flex items-center gap-3 rounded-2xl bg-muted/70 p-4 text-sm text-muted-foreground">
          <Newspaper className="size-5 shrink-0" aria-hidden />
          <p className="min-w-0">
            Haber başlıklarına şu an ulaşılamıyor.{" "}
            <Link href={routes.content.news()} className="font-semibold text-foreground underline underline-offset-2">
              Gündeme göz at
            </Link>
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * Home widget (server + small client part): active announcements as a horizontal strip.
 * Renders nothing when there is no active announcement. Place it inside the home page's px-4 container.
 */
export async function AnnouncementsStrip({ className }: { className?: string }) {
  const { items, renderedAt } = await getActiveAnnouncements();
  if (!items.length) return null;
  return <AnnouncementsStripClient items={items} renderedAt={renderedAt} className={cn(className)} />;
}
