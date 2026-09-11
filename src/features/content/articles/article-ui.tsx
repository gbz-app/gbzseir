import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatDate } from "@/core/format";
import { routes } from "@/core/routes";
import { newsCategoryLabel, newsVisual, type ArticleCategory, type ArticleSummary, type NewsCategoryDef } from "./meta";

// Presentational article pieces (no hooks): /haberler list and the article page. `categories` = news_categories
// (getVocabularies); without it the built-in labels and icons are used.

/** Cover photo, or the category gradient + icon when the story has none. Size / radius come from className. */
export function ArticleCover({
  category,
  categories,
  coverUrl,
  alt,
  eager,
  className,
  iconClassName,
}: {
  category: ArticleCategory;
  categories?: readonly NewsCategoryDef[];
  coverUrl: string | null;
  alt: string;
  eager?: boolean;
  className?: string;
  iconClassName?: string;
}) {
  if (coverUrl) {
    return (
      // Plain <img>: covers are Storage URLs today, but the column accepts any https host (next/image would reject it).
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={coverUrl}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        decoding="async"
        className={cn("bg-muted object-cover", className)}
      />
    );
  }
  const v = newsVisual(category, categories);
  return (
    <div className={cn("relative overflow-hidden bg-linear-to-br", v.gradient, className)} aria-hidden>
      <span className="absolute -top-1/4 -left-1/6 aspect-square w-1/2 rounded-full bg-white/10" />
      <span className="absolute -right-1/6 -bottom-1/3 aspect-square w-3/5 rounded-full bg-black/10" />
      <v.icon className={cn("absolute top-1/2 left-1/2 size-14 -translate-x-1/2 -translate-y-1/2 text-white/90", iconClassName)} strokeWidth={1.5} />
    </div>
  );
}

function ArticleMeta({ article, categories, className }: { article: ArticleSummary; categories?: readonly NewsCategoryDef[]; className?: string }) {
  return (
    <span className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <span className="font-semibold text-foreground/80">{newsCategoryLabel(article.category, categories)}</span>
      <span aria-hidden>·</span>
      <time dateTime={article.publishedAt}>{formatDate(article.publishedAt, { month: "long" })}</time>
    </span>
  );
}

/** Big white card: cover, category + date, title and summary. Opens the in-app article page. */
export function ArticleCard({ article, categories }: { article: ArticleSummary; categories?: readonly NewsCategoryDef[] }) {
  return (
    <Link
      href={routes.content.newsArticle(article.slug)}
      className="group block overflow-hidden rounded-3xl bg-card outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]"
    >
      <ArticleCover category={article.category} categories={categories} coverUrl={article.coverUrl} alt="" eager className="aspect-[16/9] w-full" />
      <div className="p-4">
        <ArticleMeta article={article} categories={categories} />
        <h3 className="mt-2 text-lg leading-snug font-semibold text-balance decoration-2 underline-offset-4 group-hover:underline">{article.title}</h3>
        {article.summary ? <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{article.summary}</p> : null}
      </div>
    </Link>
  );
}

/** Compact row: small cover, category + date and a 2-line title. */
export function ArticleRow({ article, categories }: { article: ArticleSummary; categories?: readonly NewsCategoryDef[] }) {
  return (
    <Link
      href={routes.content.newsArticle(article.slug)}
      className="group flex items-center gap-3 rounded-2xl p-2 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ArticleCover category={article.category} categories={categories} coverUrl={article.coverUrl} alt="" className="size-20 shrink-0 rounded-2xl" iconClassName="size-8" />
      <span className="min-w-0 flex-1">
        <ArticleMeta article={article} categories={categories} />
        <span className="mt-1 line-clamp-2 text-[15px] leading-snug font-semibold underline-offset-2 group-hover:underline">{article.title}</span>
      </span>
    </Link>
  );
}
