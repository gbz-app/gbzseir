import { JsonLd } from "@/components/seo/json-ld";
import { SITE_URL } from "@/config/site";
import { routes } from "@/core/routes";
import { getVocabularies } from "@/features/business/lib/vocabularies";
import { NewsList } from "@/features/content/articles/news-list";
import { listPublishedArticles } from "@/features/content/articles/queries";
import { contentMetadata } from "@/features/content/seo";

// Our articles refresh every 5 min (admin edits also expire the "content:articles" tag). Must be a literal.
export const revalidate = 300;

const TITLE = "Haberler";
const DESCRIPTION = "Gebzem ekibinin hazırladığı Gebze ve Kocaeli haberleri.";

export const metadata = contentMetadata({ title: TITLE, description: DESCRIPTION, path: routes.content.news() });

/** /haberler: only the stories our team publishes (news_articles). RSS headlines are not shown publicly. */
export default async function NewsPage() {
  const [articles, { newsCategories }] = await Promise.all([listPublishedArticles(60).catch(() => []), getVocabularies()]);

  return (
    <>
      <NewsList articles={articles} categories={newsCategories} />
      {articles.length ? (
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
              itemListElement: articles.slice(0, 20).map((a, index) => ({
                "@type": "ListItem",
                position: index + 1,
                url: `${SITE_URL}${routes.content.newsArticle(a.slug)}`,
                name: a.title,
              })),
            },
          }}
        />
      ) : null}
    </>
  );
}
