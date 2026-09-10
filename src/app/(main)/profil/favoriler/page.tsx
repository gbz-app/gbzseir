import type { Metadata } from "next";
import { routes } from "@/core/routes";
import { PageHeader } from "@/components/shared/page-header";
import { requireProfile } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { CARD_SELECT } from "@/features/listings/search";
import { toCardData } from "@/features/listings/types";
import type { PoiKind } from "@/features/nearby/types";
import { FavoritesView, type FavoriteBusiness, type FavoritePoi } from "@/features/profile/components/favorites-view";

export const metadata: Metadata = { title: "Favorilerim", robots: { index: false } };

type Row = Record<string, unknown>;

function relName(v: unknown): string | null {
  const r = Array.isArray(v) ? v[0] : v;
  return r && typeof r === "object" && "name" in r ? String((r as { name: unknown }).name ?? "") || null : null;
}

/** G6 - Favorilerim. */
export default async function FavoritesPage() {
  const { user } = await requireProfile(routes.profile.favorites());
  const supabase = await createClient();
  const { data: favs } = await supabase
    .from("favorites")
    .select("target_type,target_id,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(300);

  const ids = (t: string) => (favs ?? []).filter((f) => f.target_type === t).map((f) => f.target_id);
  const order = (list: string[]) => new Map(list.map((id, i) => [id, i]));
  const listingIds = ids("listing");
  const businessIds = ids("business");
  const poiIds = ids("poi");

  const [listingRows, businessRows, poiRows] = await Promise.all([
    listingIds.length ? supabase.from("listings").select(CARD_SELECT).in("id", listingIds).then((r) => (r.data ?? []) as unknown as Row[]) : Promise.resolve([] as Row[]),
    businessIds.length
      ? supabase
          .from("businesses")
          .select("id,name,slug,logo_url,category_label,rating_avg,rating_count,verification_level")
          .in("id", businessIds)
          .then((r) => (r.data ?? []) as unknown as Row[])
      : Promise.resolve([] as Row[]),
    poiIds.length ? supabase.from("poi").select("id,kind,name,slug,neighbourhoods(name)").in("id", poiIds).then((r) => (r.data ?? []) as unknown as Row[]) : Promise.resolve([] as Row[]),
  ]);

  const lo = order(listingIds);
  const bo = order(businessIds);
  const po = order(poiIds);
  const listings = listingRows.map(toCardData).sort((a, b) => (lo.get(a.id) ?? 0) - (lo.get(b.id) ?? 0));
  const businesses: FavoriteBusiness[] = businessRows
    .map((r) => ({
      id: String(r.id),
      name: String(r.name ?? ""),
      slug: (r.slug as string | null) ?? null,
      logo_url: (r.logo_url as string | null) ?? null,
      category_label: (r.category_label as string | null) ?? null,
      rating_avg: Number(r.rating_avg ?? 0),
      rating_count: Number(r.rating_count ?? 0),
      verification_level: Number(r.verification_level ?? 0),
    }))
    .sort((a, b) => (bo.get(a.id) ?? 0) - (bo.get(b.id) ?? 0));
  const pois: FavoritePoi[] = poiRows
    .map((r) => ({
      id: String(r.id),
      kind: r.kind as PoiKind,
      name: String(r.name ?? ""),
      slug: String(r.slug ?? ""),
      neighbourhoodName: relName(r.neighbourhoods),
    }))
    .sort((a, b) => (po.get(a.id) ?? 0) - (po.get(b.id) ?? 0));

  return (
    <>
      <PageHeader title="Favorilerim" backHref={routes.profile.root()} />
      <FavoritesView listings={listings} businesses={businesses} pois={pois} />
    </>
  );
}
