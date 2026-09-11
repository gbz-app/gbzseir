import { getVocabularies } from "@/features/business/lib/vocabularies";
import type { ArticleSummary } from "@/features/content/articles/meta";
import { HomeNewsTabs } from "./home-news-tabs";

/**
 * Home "Haberler": only the stories our team publishes (news_articles). Server wrapper that reads the news categories
 * (admin order and labels; cached, built-in fallback) for the client tabs and cards in home-news-tabs.tsx.
 */
export async function HomeNews({ articles = [] }: { articles?: ArticleSummary[] }) {
  const { newsCategories } = await getVocabularies();
  return <HomeNewsTabs articles={articles} categories={newsCategories} />;
}
