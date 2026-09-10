import Link from "next/link";
import { History, Info, Newspaper } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { JsonLd } from "@/components/seo/json-ld";
import { SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { formatDateTime } from "@/core/format";
import { getNews } from "@/features/content/news/get-news";
import { NewsFeed } from "@/features/content/news/news-feed";
import { contentMetadata } from "@/features/content/seo";

// Same interval as the feed fetches (20 min). Must be a literal for static analysis.
export const revalidate = 1200;

const TITLE = "Gebze Gündemi";
const DESCRIPTION =
  "Gebze ve Kocaeli'deki yerel haber sitelerinden derlenen güncel başlıklar ve kısa özetler. Haberin tamamı kaynağında.";

export const metadata = contentMetadata({ title: TITLE, description: DESCRIPTION, path: routes.content.news() });

/** I1 "Gebze Gündemi (kaynaklardan derleme)": headlines from local RSS feeds, each opening the source site. */
export default async function NewsPage() {
  const news = await getNews();
  const { items } = news;

  return (
    <>
      <PageHeader title={TITLE} subtitle="Kaynaklardan derleme" />
      <div className="flex flex-col gap-4 px-4 pt-4 pb-8">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Gebze ve çevresindeki yerel haber sitelerinin başlıkları tek yerde. Habere dokununca kaynağında açılır.
        </p>

        {news.fromArchive ? (
          <div role="status" className="flex items-start gap-3 rounded-2xl bg-highlight-soft px-4 py-3 text-sm text-highlight-foreground dark:text-foreground">
            <History className="mt-0.5 size-5 shrink-0 text-highlight" aria-hidden />
            <p>
              <span className="font-bold">Kaynaklara şu an ulaşılamıyor.</span> Son kaydedilen başlıklar gösteriliyor.
            </p>
          </div>
        ) : null}

        {items.length ? (
          <NewsFeed items={items} />
        ) : (
          <EmptyState
            icon={Newspaper}
            title="Haber başlıklarına şu an ulaşılamıyor"
            description="Yerel haber sitelerine bağlanamadık. Biraz sonra tekrar dene."
            actionLabel="Haber kaynaklarını gör"
            actionHref={routes.content.sources()}
          />
        )}

        <footer className="rounded-2xl bg-muted/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <p className="flex items-start gap-1.5">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Başlıklar ve en fazla 280 karakterlik özetler, yerel haber sitelerinin herkese açık RSS akışlarından otomatik derlenir. Haberlerin
              tamamı, görselleri ve tüm hakları ilgili yayıncılara aittir; içerikten kaynak site sorumludur.
            </span>
          </p>
          <p className="mt-1.5 pl-5">
            Son güncelleme: <span className="font-semibold text-foreground">{formatDateTime(news.fetchedAt)}</span>
            {news.sources.length ? ` · ${news.okCount}/${news.sources.length} kaynak` : null}
            {" · "}
            <Link href={routes.content.sources()} className="font-semibold text-foreground underline underline-offset-2">
              Kaynakların listesi
            </Link>
          </p>
        </footer>

        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: TITLE,
            description: DESCRIPTION,
            url: `${SITE_URL}${routes.content.news()}`,
            inLanguage: "tr-TR",
            mainEntity: {
              "@type": "ItemList",
              itemListElement: items.slice(0, 20).map((item, index) => ({
                "@type": "ListItem",
                position: index + 1,
                url: item.url,
                name: item.title,
              })),
            },
          }}
        />
      </div>
    </>
  );
}
