import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { routes } from "@/core/routes";
import { CITY } from "@/config/site";
import { isFiltered, listingsHref, parseListingsQuery } from "@/features/listings/filters";
import { ListingsScreen } from "@/features/listings/components/listings-screen";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = parseListingsQuery(await searchParams, "ikinci-el");
  return {
    title: `${CITY.name} İkinci El İlanlar`,
    description: `${CITY.name}'de ikinci el eşya ilanları. Satıcıyı doğrudan ara, mesajlaşmayla uğraşma.`,
    alternates: { canonical: routes.listings.classifieds() },
    robots: isFiltered(query) ? { index: false, follow: true } : undefined,
  };
}

/** E1 - İkinci El ilanları. Old /ilanlar?tab=is-ilanlari links move (308) to /is-ilanlari with the same filters. */
export default async function ClassifiedsPage({ searchParams }: Props) {
  const raw = await searchParams;
  const legacy = parseListingsQuery(raw);
  if (legacy.tab === "is-ilanlari") permanentRedirect(listingsHref(legacy));
  return <ListingsScreen query={parseListingsQuery(raw, "ikinci-el")} />;
}
