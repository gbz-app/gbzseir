import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Clock } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { ShareButton } from "@/components/shared/share-button";
import { JsonLd } from "@/components/seo/json-ld";
import { APP_NAME, SITE_URL } from "@/config/site";
import { formatDate, truncate } from "@/core/format";
import { routes } from "@/core/routes";
import { getVocabularies } from "@/features/business/lib/vocabularies";
import { ArticleBody, articlePlainText } from "@/features/content/articles/article-body";
import { ArticleCover, ArticleRow } from "@/features/content/articles/article-ui";
import { newsCategoryLabel, readingMinutes } from "@/features/content/articles/meta";
import { getPublishedArticle, listPublishedArticles, listPublishedArticleSlugs } from "@/features/content/articles/queries";

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
  const [a, { newsCategories }] = await Promise.all([getPublishedArticle(normalizeSlug((await params).slug)).catch(() => null), getVocabularies()]);
  if (!a) return { title: "Haber bulunamadı", robots: { index: false } };
  const path = routes.content.newsArticle(a.slug);
  const description = truncate(a.summary || articlePlainText(a.body) || `${a.title} | ${APP_NAME} haberleri`, 160);
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
      section: newsCategoryLabel(a.category, newsCategories),
      images: [image],
    },
    twitter: { card: "summary_large_image", title: a.title, description, images: [image.url] },
  };
}

/** Our own story: full-width cover, category chip, big title, date + reading time, reading column, share, other stories. */
export default async function NewsArticlePage({ params }: Props) {
  const slug = normalizeSlug((await params).slug);
  const [a, { newsCategories }, recent] = await Promise.all([getPublishedArticle(slug), getVocabularies(), listPublishedArticles(6).catch(() => [])]);
  if (!a) notFound();

  const path = routes.content.newsArticle(a.slug);
  const url = `${SITE_URL}${path}`;
  const label = newsCategoryLabel(a.category, newsCategories);
  const others = recent.filter((r) => r.slug !== a.slug).slice(0, 4);

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
      <PageHeader title="Haberler" backHref={routes.content.news()} actions={<ShareButton title={a.title} text={a.summary ?? undefined} url={path} iconOnly />} />

      <div className="pb-nav">
        <article>
          <ArticleCover coverUrl={a.coverUrl} alt={a.title} eager className="aspect-[16/10] w-full" iconClassName="size-16" />

          <div className="mx-auto max-w-[40rem] px-5 pt-6">
            <header>
              <span className="inline-flex h-7 items-center rounded-full bg-brand-soft px-3 text-xs font-semibold text-primary">{label}</span>
              <h1 className="mt-3 text-[1.75rem] leading-[1.2] font-bold tracking-tight text-balance">{a.title}</h1>
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <time dateTime={a.publishedAt}>{formatDate(a.publishedAt, { month: "long", year: true })}</time>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" aria-hidden />
                  {readingMinutes(a.summary, a.body)} dk okuma
                </span>
              </p>
              {a.summary ? <p className="mt-5 text-lg leading-relaxed font-medium text-foreground">{a.summary}</p> : null}
            </header>

            <ArticleBody body={a.body} className="mt-6" />

            <ShareButton
              title={a.title}
              text={a.summary ?? undefined}
              url={path}
              label="Haberi paylaş"
              variant="default"
              size="lg"
              className="mt-10 w-full bg-foreground text-background shadow-none hover:bg-foreground/90"
            />
          </div>
        </article>

        {/* Outside <article>: related stories are not part of this one. */}
        {others.length ? (
          <section aria-labelledby="diger-haberler" className="mx-auto mt-10 max-w-[40rem] px-4">
            <div className="flex items-center justify-between gap-3 px-1">
              <h2 id="diger-haberler" className="text-lg font-semibold">
                Diğer haberler
              </h2>
              <Link
                href={routes.content.news()}
                className="inline-flex min-h-11 items-center gap-0.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Tümü <ChevronRight className="size-4" aria-hidden />
              </Link>
            </div>
            <ul className="mt-1 flex flex-col gap-2.5">
              {others.map((o) => (
                <li key={o.id}>
                  <ArticleRow article={o} categories={newsCategories} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
