import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { formatPhoneInputTR } from "@/core/phone";
import { routes } from "@/core/routes";
import { requireProfile } from "@/lib/auth/server";
import { BusinessEditForm } from "@/features/business/components/business-edit-form";
import { mediaPathFromUrl } from "@/features/business/components/editor/image-picker";
import { defaultHours, hasAnyHours, parseWorkingHours } from "@/features/business/lib/hours";
import { getOwnerBusiness } from "@/features/business/lib/owner-queries";
import { resolveVertical } from "@/features/business/lib/verticals";

export const metadata: Metadata = { title: "İşletme sayfamı düzenle", robots: { index: false } };

/** H4 - İşletme sayfasını düzenle: tür, bilgiler, fiyat/yıldız, olanaklar, iletişim, konum, saatler, hizmetler. */
export default async function BusinessEditPage() {
  const { user } = await requireProfile(routes.business.edit());
  const b = await getOwnerBusiness();
  if (!b) redirect(routes.business.intro());
  if (b.status !== "approved") redirect(routes.business.root());

  const hours = parseWorkingHours(b.working_hours);
  const vertical = resolveVertical(b.vertical, b.kinds);

  return (
    <>
      <PageHeader title="İşletme sayfamı düzenle" subtitle={b.name} backHref={routes.business.root()} hideBottomNav />
      <BusinessEditForm
        initial={{
          id: b.id,
          slug: b.slug,
          isService: b.kinds.includes("service"),
          name: b.name,
          vertical: vertical === "etkinlik" ? "diger" : vertical,
          categoryLabel: b.category_label ?? "",
          description: b.description ?? "",
          logo: b.logo_url ? { url: b.logo_url, path: mediaPathFromUrl(b.logo_url, user.id) } : null,
          phone: b.phone ? formatPhoneInputTR(b.phone) : "",
          website: b.website ?? "",
          instagram: b.instagram ?? "",
          address: b.address ?? "",
          location: b.lat !== null && b.lng !== null ? { lat: b.lat, lng: b.lng } : null,
          neighbourhoodId: b.neighbourhood_id,
          priceLevel: b.price_level,
          starRating: b.star_rating,
          amenities: b.amenities,
          hours: hasAnyHours(hours) ? hours : defaultHours(),
          categoryIds: b.category_ids,
          areaIds: b.area_ids,
        }}
      />
    </>
  );
}
