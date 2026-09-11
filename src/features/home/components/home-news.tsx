import { getVocabularies } from "@/features/business/lib/vocabularies";
import type { ArticleSummary } from "@/features/content/articles/meta";
import type { NewsItem } from "@/features/content/news/parse";
import { HomeNewsTabs } from "./home-news-tabs";

/**
 * Home "Haberler". Server wrapper: reads the news categories (admin order, labels and icons; cached, built-in fallback)
 * for the client tabs and cards in home-news-tabs.tsx.
 */
export async function HomeNews({ articles = [], items }: { articles?: ArticleSummary[]; items: NewsItem[] }) {
  const { newsCategories } = await getVocabularies();
  return <HomeNewsTabs articles={articles} items={items} categories={newsCategories} />;
}
