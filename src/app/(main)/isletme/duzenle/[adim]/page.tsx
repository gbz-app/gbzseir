import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { formatPhoneInputTR } from "@/core/phone";
import { routes } from "@/core/routes";
import { requireProfile } from "@/lib/auth/server";
import { mediaPathFromUrl } from "@/features/business/components/editor/image-picker";
import { EditStepForm } from "@/features/business/components/edit/step-form";
import { editStepTitle, parseEditStep, type BusinessEditData } from "@/features/business/components/edit/steps";
import { defaultHours, hasAnyHours, parseWorkingHours } from "@/features/business/lib/hours";
import { getOwnerBusiness, type OwnerBusiness } from "@/features/business/lib/owner-queries";
import { resolveVertical } from "@/features/business/lib/verticals";
import { getVocabularies } from "@/features/business/lib/vocabularies";

export const metadata: Metadata = { title: "İşletme sayfamı düzenle", robots: { index: false } };

type Props = { params: Promise<{ adim: string }> };

function toEditData(b: OwnerBusiness, userId: string): BusinessEditData {
  const hours = parseWorkingHours(b.working_hours);
  const vertical = resolveVertical(b.vertical, b.kinds);
  return {
    id: b.id,
    slug: b.slug,
    isService: b.kinds.includes("service"),
    name: b.name,
    vertical: vertical === "etkinlik" ? "diger" : vertical,
    categoryLabel: b.category_label ?? "",
    description: b.description ?? "",
    logo: b.logo_url ? { url: b.logo_url, path: mediaPathFromUrl(b.logo_url, userId) } : null,
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
  };
}

/** H4 - one section of the business page (temel, iletisim, konum, saatler, ozellikler, hizmet-alani), saved on its own. */
export default async function BusinessEditStepPage({ params }: Props) {
  const step = parseEditStep((await params).adim);
  if (!step) notFound();
  const { user } = await requireProfile(routes.business.editStep(step));
  const [b, vocab] = await Promise.all([getOwnerBusiness(), getVocabularies()]);
  if (!b) redirect(routes.business.intro());
  if (b.status !== "approved") redirect(routes.business.root());
  const data = toEditData(b, user.id);
  // Service categories and areas exist only for service firms.
  if (step === "hizmet-alani" && !data.isService) redirect(routes.business.edit());

  return (
    <>
      <PageHeader title={editStepTitle(step, data.vertical)} subtitle={b.name} backHref={routes.business.edit()} hideBottomNav />
      <EditStepForm key={`${b.id}:${step}`} step={step} initial={data} amenities={vocab.amenities} />
    </>
  );
}
