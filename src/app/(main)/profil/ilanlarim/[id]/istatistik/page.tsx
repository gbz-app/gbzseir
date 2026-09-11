import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChartColumn } from "lucide-react";
import { routes } from "@/core/routes";
import { ProfilePageHeader } from "@/components/shared/profile-page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requireProfile } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/features/listings/format";
import { ListingStatsView } from "@/features/listings/components/stats/listing-stats";
import { parseListingStats } from "@/features/listings/components/stats/stats-data";

export const metadata: Metadata = { title: "İlan istatistikleri", robots: { index: false } };

type Props = { params: Promise<{ id: string }> };

/** Owner statistics of one listing (2. el or iş ilanı); the RPC answers only the owner or an admin. */
export default async function ListingStatsPage({ params }: Props) {
  const { id } = await params;
  await requireProfile(routes.profile.listingStats(id));
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("listing_owner_stats", { p_listing: id, p_days: 30 });
  if (error) {
    return (
      <>
        <ProfilePageHeader title="İstatistikler" backHref={routes.profile.listings()} />
        <EmptyState icon={ChartColumn} title="İstatistikler yüklenemedi" description="Bağlantını kontrol edip sayfayı yenile." />
      </>
    );
  }
  const stats = parseListingStats(data);
  if (!stats) notFound();

  return (
    <>
      <ProfilePageHeader
        title="İstatistikler"
        subtitle={stats.listing.title}
        backHref={stats.listing.type === "job" ? routes.profile.jobs() : routes.profile.listings()}
      />
      <ListingStatsView stats={stats} />
    </>
  );
}
