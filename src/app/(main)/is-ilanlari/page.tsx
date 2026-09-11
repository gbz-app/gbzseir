import type { Metadata } from "next";
import { routes } from "@/core/routes";
import { districtName } from "@/config/districts";
import { isFiltered, parseListingsQuery } from "@/features/listings/filters";
import { ListingsScreen } from "@/features/listings/components/listings-screen";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = parseListingsQuery(await searchParams, "is-ilanlari");
  // Kocaeli, or the filtered district (same as /ilanlar).
  const place = districtName(query.ilce);
  return {
    title: `${place} İş İlanları`,
    description: `${place} ve OSB'lerdeki güncel iş ilanları. Başvurmak için işverenle doğrudan telefonla görüş.`,
    alternates: { canonical: routes.listings.jobs() },
    robots: isFiltered(query) ? { index: false, follow: true } : undefined,
  };
}

/** E1b - İş ilanları (separate from İkinci El). Only approved business owners see "İş ilanı ver". */
export default async function JobsPage({ searchParams }: Props) {
  return <ListingsScreen query={parseListingsQuery(await searchParams, "is-ilanlari")} />;
}
