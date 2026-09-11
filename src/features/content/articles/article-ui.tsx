import Link from "next/link";
import { Newspaper } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/core/format";
import { routes } from "@/core/routes";
import { newsCategoryLabel, type ArticleSummary, type NewsCategoryDef } from "./meta";

// Presentational article pieces (no hooks): /haberler list, the article page and the home cards. `categories` =
// news_categories (getVocabularies); without it the built-in labels are used. No shadows, borders or rings.

/** Cover photo, or a purple gradient with a newspaper icon when the story has none. Size / radius come from className. */
export function ArticleCover({
  coverUrl,
  alt,
  eager,
  className,
  iconClassName,
}: {
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
  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden bg-linear-to-br from-violet-500 via-purple-500 to-indigo-600 dark:from-violet-600 dark:via-purple-700 dark:to-indigo-800",
        className,
      )}
      aria-hidden
    >
      <Newspaper className={cn("size-14 text-white/85", iconClassName)} strokeWidth={1.5} />
    </div>
  );
}

/** "Gündem · 11 Eylül" */
export function ArticleMeta({ article, categories, className }: { article: ArticleSummary; categories?: readonly NewsCategoryDef[]; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <span className="truncate font-medium text-primary">{newsCategoryLabel(article.category, categories)}</span>
      <span aria-hidden>·</span>
      <time dateTime={article.publishedAt} className="shrink-0">
        {formatDate(article.publishedAt, { month: "long" })}
      </time>
    </span>
  );
}

/** Lead story: white card with a wide cover, category + date, title and a two-line summary. */
export function ArticleCard({ article, categories, eager }: { article: ArticleSummary; categories?: readonly NewsCategoryDef[]; eager?: boolean }) {
  return (
    <Link
      href={routes.content.newsArticle(article.slug)}
      className="group block overflow-hidden rounded-3xl bg-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ArticleCover coverUrl={article.coverUrl} alt="" eager={eager} className="aspect-[16/9] w-full" />
      <div className="px-4 pt-3.5 pb-4">
        <ArticleMeta article={article} categories={categories} />
        <h2 className="mt-1.5 text-xl leading-snug font-semibold tracking-tight text-balance decoration-2 underline-offset-4 group-hover:underline">
          {article.title}
        </h2>
        {article.summary ? <p className="mt-1.5 line-clamp-2 text-[15px] leading-relaxed text-muted-foreground">{article.summary}</p> : null}
      </div>
    </Link>
  );
}

/** Row: small cover, two-line title, category + date. White surface of its own. */
export function ArticleRow({ article, categories }: { article: ArticleSummary; categories?: readonly NewsCategoryDef[] }) {
  return (
    <Link
      href={routes.content.newsArticle(article.slug)}
      className="group flex items-center gap-3.5 rounded-3xl bg-card p-2 pr-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ArticleCover coverUrl={article.coverUrl} alt="" className="size-[4.5rem] shrink-0 rounded-2xl" iconClassName="size-7" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[15px] leading-snug font-semibold underline-offset-2 group-hover:underline">{article.title}</span>
        <ArticleMeta article={article} categories={categories} className="mt-1" />
      </span>
    </Link>
  );
}
