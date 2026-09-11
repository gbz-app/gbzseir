import { Building2, Landmark, Megaphone, Newspaper, Ticket, Trophy, type LucideIcon } from "lucide-react";
import { NEWS_CATEGORY_ORDER, type NewsCategory } from "../news/parse";

/**
 * Our own news articles (public.news_articles): shared types, category visuals and text helpers.
 * Pure, safe on the server and in client components. Categories are the same as the RSS headlines'.
 */

export type ArticleCategory = NewsCategory;

export function toArticleCategory(value: string | null | undefined): ArticleCategory {
  return NEWS_CATEGORY_ORDER.find((c) => c === value) ?? "gundem";
}

/** Category gradient + icon, shown when a story has no photo (home cards, article cover). */
export const NEWS_VISUAL: Record<NewsCategory, { icon: LucideIcon; gradient: string }> = {
  gundem: { icon: Newspaper, gradient: "from-sky-500 via-blue-500 to-indigo-600" },
  siyaset: { icon: Landmark, gradient: "from-rose-500 via-red-500 to-orange-500" },
  belediye: { icon: Building2, gradient: "from-violet-500 via-purple-500 to-indigo-700" },
  spor: { icon: Trophy, gradient: "from-emerald-500 via-green-500 to-teal-600" },
  etkinlik: { icon: Ticket, gradient: "from-fuchsia-500 via-pink-500 to-rose-500" },
  duyuru: { icon: Megaphone, gradient: "from-amber-500 via-orange-500 to-red-500" },
};

export type ArticleSummary = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  category: ArticleCategory;
  coverUrl: string | null;
  /** ISO timestamp (always set for published stories). */
  publishedAt: string;
};

export type Article = ArticleSummary & { body: string; updatedAt: string };

/** Body paragraphs: blank lines split paragraphs, single line breaks stay inside one. */
export function articleParagraphs(body: string): string[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
