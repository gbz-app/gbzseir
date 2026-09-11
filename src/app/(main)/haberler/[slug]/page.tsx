import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Newspaper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { ShareButton } from "@/components/shared/share-button";
import { JsonLd } from "@/components/seo/json-ld";
import { APP_NAME, SITE_URL } from "@/config/site";
import { formatDate, formatTime, truncate } from "@/core/format";
import { routes } from "@/core/routes";
import { ArticleCover } from "@/features/content/articles/article-ui";
import { articleParagraphs } from "@/features/content/articles/meta";
import { getPublishedArticle, listPublishedArticleSlugs } from "@/features/content/articles/queries";
import { NEWS_CATEGORY_LABELS } from "@/features/content/news/parse";

export const revalidate = 300;

/** Published slugs are prerendered at build; newer ones render on their first visit (ISR). */
export async function generateStaticParams() {
  const rows = await listPublishedArticleSlugs().catch(() => []);
  return rows.map((r) => ({ slug: r.slug }));
}

type Props = { params: Promise<{ slug: string }> };

function normalizeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw).trim().toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await getPublishedArticle(normalizeSlug((await params).slug)).catch(() => null);
  if (!a) return { title: "Haber bulunamadı", robots: { index: false } };
  const path = routes.content.newsArticle(a.slug);
  const description = truncate(a.summary || a.body.replace(/\s+/g, " ") || `${a.title} | ${APP_NAME} haberleri`, 160);
  const image = a.coverUrl ? { url: a.coverUrl, alt: a.title } : { url: "/icons/og-image.png", width: 1200, height: 630, alt: APP_NAME };
  return {
    title: a.title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      locale: "tr_TR",
      siteName: APP_NAME,
      title: a.title,
      description,
      url: path,
      publishedTime: a.publishedAt,
      modifiedTime: a.updatedAt,
      section: NEWS_CATEGORY_LABELS[a.category],
      images: [image],
    },
    twitter: { card: "summary_large_image", title: a.title, description, images: [image.url] },
  };
}

/** Our own news story: cover (or category visual), category, date, summary and body paragraphs. */
export default async function NewsArticlePage({ params }: Props) {
  const a = await getPublishedArticle(normalizeSlug((await params).slug));
  if (!a) notFound();

  const url = `${SITE_URL}${routes.content.newsArticle(a.slug)}`;
  const label = NEWS_CATEGORY_LABELS[a.category];
  const paragraphs = articleParagraphs(a.body);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "NewsArticle",
          headline: a.title,
          description: a.summary ?? undefined,
          image: a.coverUrl ? [a.coverUrl] : undefined,
          datePublished: a.publishedAt,
          dateModified: a.updatedAt,
          articleSection: label,
          inLanguage: "tr-TR",
          mainEntityOfPage: url,
          url,
          author: { "@type": "Organization", name: APP_NAME, url: SITE_URL },
          publisher: { "@type": "Organization", name: APP_NAME, url: SITE_URL },
        }}
      />
      <PageHeader
        title="Haberler"
        subtitle={label}
        backHref={routes.content.news()}
        actions={<ShareButton title={a.title} text={a.summary ?? undefined} iconOnly />}
      />

      <article className="flex flex-col gap-5 px-4 pt-4 pb-nav">
        <ArticleCover category={a.category} coverUrl={a.coverUrl} alt={a.title} eager className="aspect-[16/10] w-full rounded-3xl" iconClassName="size-16" />

        <header>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex h-7 items-center rounded-full bg-card px-3 text-xs font-semibold text-foreground">{label}</span>
            <time dateTime={a.publishedAt}>
              {formatDate(a.publishedAt, { month: "long", year: true })} · {formatTime(a.publishedAt)}
            </time>
          </div>
          <h2 className="mt-3 text-[1.625rem] leading-tight font-semibold tracking-tight text-balance">{a.title}</h2>
          {a.summary ? <p className="mt-3 text-[17px] leading-relaxed font-medium text-foreground/80">{a.summary}</p> : null}
        </header>

        {paragraphs.length ? (
          <div className="flex flex-col gap-4 text-base leading-relaxed text-foreground/90">
            {paragraphs.map((p, i) => (
              <p key={i} className="whitespace-pre-line">
                {p}
              </p>
            ))}
          </div>
        ) : null}

        <footer className="mt-2 flex gap-2">
          <ShareButton title={a.title} text={a.summary ?? undefined} variant="secondary" size="lg" className="flex-1 rounded-full" />
          <Button asChild variant="secondary" size="lg" className="flex-1 rounded-full">
            <Link href={routes.content.news()}>
              <Newspaper aria-hidden /> Tüm haberler
            </Link>
          </Button>
        </footer>
      </article>
    </>
  );
}
