import { Building2, Landmark, Megaphone, Newspaper, Ticket, Trophy, type LucideIcon } from "lucide-react";
import { CATEGORY_KEY_RE, categoryIcon, gradientFor, type CategoryDef } from "@/features/business/lib/category-visuals";
import { NEWS_CATEGORY_LABELS, NEWS_CATEGORY_ORDER, type BuiltinNewsCategory, type NewsCategory } from "../news/parse";

/**
 * Our own news articles (public.news_articles): shared types, category visuals and text helpers.
 * Pure, safe on the server and in client components. Categories are public.news_categories keys (admin-managed); the
 * RSS headlines use the built-in ones.
 */

export type ArticleCategory = NewsCategory;

/** A row of public.news_categories (getVocabularies().newsCategories) or its built-in fallback. */
export type NewsCategoryDef = CategoryDef;

/** Any well-formed key (the foreign key guarantees it exists); "gundem" otherwise. */
export function toArticleCategory(value: string | null | undefined): ArticleCategory {
  return value && CATEGORY_KEY_RE.test(value) ? value : "gundem";
}

/** Built-in category gradient + icon, shown when a story has no photo (home cards, article cover). */
export const NEWS_VISUAL: Record<BuiltinNewsCategory, { icon: LucideIcon; gradient: string }> = {
  gundem: { icon: Newspaper, gradient: "from-sky-500 via-blue-500 to-indigo-600" },
  siyaset: { icon: Landmark, gradient: "from-rose-500 via-red-500 to-orange-500" },
  belediye: { icon: Building2, gradient: "from-violet-500 via-purple-500 to-indigo-700" },
  spor: { icon: Trophy, gradient: "from-emerald-500 via-green-500 to-teal-600" },
  etkinlik: { icon: Ticket, gradient: "from-fuchsia-500 via-pink-500 to-rose-500" },
  duyuru: { icon: Megaphone, gradient: "from-amber-500 via-orange-500 to-red-500" },
};

const NEWS_ICON_NAMES: Record<BuiltinNewsCategory, string> = {
  gundem: "newspaper",
  siyaset: "landmark",
  belediye: "building-2",
  spor: "trophy",
  etkinlik: "ticket",
  duyuru: "megaphone",
};

/** Seed / fallback of public.news_categories (same order, labels and icons as the migration). */
export const NEWS_CATEGORIES: readonly NewsCategoryDef[] = NEWS_CATEGORY_ORDER.map((key) => ({
  key,
  label: NEWS_CATEGORY_LABELS[key] ?? key,
  icon: NEWS_ICON_NAMES[key],
  active: true,
}));

const NEWS_GRADIENTS = Object.values(NEWS_VISUAL).map((v) => v.gradient);
const builtinVisual = (key: string) => (Object.hasOwn(NEWS_VISUAL, key) ? NEWS_VISUAL[key as BuiltinNewsCategory] : undefined);

/** Label of a category: the vocabulary's, else the built-in one, else the key. */
export function newsCategoryLabel(key: string, categories: readonly NewsCategoryDef[] = NEWS_CATEGORIES): string {
  // hasOwn: an admin key like "constructor" must not hit Object.prototype.
  return categories.find((c) => c.key === key)?.label ?? (Object.hasOwn(NEWS_CATEGORY_LABELS, key) ? NEWS_CATEGORY_LABELS[key] : undefined) ?? key;
}

/** Gradient + icon of a category: the vocabulary's icon, the built-in gradient (admin-added keys get one from the palette). */
export function newsVisual(key: string, categories: readonly NewsCategoryDef[] = NEWS_CATEGORIES): { icon: LucideIcon; gradient: string } {
  const builtin = builtinVisual(key);
  const icon = categories.find((c) => c.key === key)?.icon;
  return { icon: categoryIcon(icon, builtin?.icon ?? Newspaper), gradient: builtin?.gradient ?? gradientFor(key, NEWS_GRADIENTS) };
}

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

/** Reading time in whole minutes (about 200 words a minute, at least 1). Markup characters are ignored. */
export function readingMinutes(...texts: Array<string | null | undefined>): number {
  const words = texts
    .join(" ")
    .replace(/!?\[([^\]]*)\]\([^)\s]+\)/g, "$1")
    .replace(/[#>*_`-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Body paragraphs: blank lines split paragraphs, single line breaks stay inside one. */
export function articleParagraphs(body: string): string[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
