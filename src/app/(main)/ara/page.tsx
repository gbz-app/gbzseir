import type { Metadata } from "next";
import { getVocabularies } from "@/features/business/lib/vocabularies";
import { SearchScreen } from "@/features/search/components/search-screen";
import { SEARCH_MIN, cleanQuery, parseSearchGroup, type SearchAnswer } from "@/features/search/query";
import { getPopularSearches, searchAll } from "@/features/search/server";

export const metadata: Metadata = { title: "Ara", robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * J1 - Genel arama. Live results come from the client (SearchScreen); a direct ?q= visit (home search, shared link,
 * JSON-LD SearchAction) is rendered on the server too. ?tur= shows one group with every row ("Tümünü gör").
 */
export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = cleanQuery(typeof sp.q === "string" ? sp.q : "");
  const active = q.length >= SEARCH_MIN;
  const focus = active ? parseSearchGroup(sp.tur) : undefined;

  const [data, popular, vocab] = await Promise.all([
    active ? searchAll(q, focus ? 20 : 8) : Promise.resolve(undefined),
    getPopularSearches(10),
    getVocabularies(),
  ]);
  const initial: SearchAnswer | null = data === undefined ? null : { q, data };

  return (
    <SearchScreen
      initialQ={q}
      initial={initial}
      focus={focus}
      popular={popular}
      newsCategories={vocab.newsCategories}
      placeCategories={vocab.placeCategories}
    />
  );
}
