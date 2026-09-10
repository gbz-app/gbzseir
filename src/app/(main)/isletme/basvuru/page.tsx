import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/server";
import { formatPhoneInputTR, fromSupabasePhone } from "@/core/phone";
import { routes } from "@/core/routes";
import { ApplyWizard, type ApplyData } from "@/features/business/components/apply-wizard";
import { mediaPathFromUrl } from "@/features/business/components/editor/image-picker";
import { defaultHours, hasAnyHours, parseWorkingHours } from "@/features/business/lib/hours";
import { getOwnerBusiness } from "@/features/business/lib/owner-queries";
import { FEATURES } from "@/config/site";
import { ApplicationsPaused } from "@/features/business/components/applications-paused";

export const metadata: Metadata = { title: "İşletme Başvurusu", robots: { index: false } };

/** H1: new application, or re-submission of a pending / rejected one (pre-filled). */
export default async function BusinessApplyPage() {
  const { user, profile } = await requireProfile(routes.business.apply());
  const existing = await getOwnerBusiness();
  if (existing && existing.status !== "pending" && existing.status !== "rejected") redirect(routes.business.root());
  if (!FEATURES.businessApplications) return <ApplicationsPaused />;

  const loginPhone = profile.phone ?? fromSupabasePhone(user.phone);
  const toInput = (e164: string | null | undefined) => (e164 ? formatPhoneInputTR(e164) : "");

  let initial: ApplyData;
  if (existing) {
    const hours = parseWorkingHours(existing.working_hours);
    initial = {
      kinds: existing.kinds,
      name: existing.name,
      categoryLabel: existing.category_label ?? "",
      description: existing.description ?? "",
      logo: existing.logo_url ? { url: existing.logo_url, path: mediaPathFromUrl(existing.logo_url, user.id) } : null,
      phone: toInput(existing.phone ?? loginPhone),
      address: existing.address ?? "",
      location: existing.lat !== null && existing.lng !== null ? { lat: existing.lat, lng: existing.lng } : null,
      neighbourhoodId: existing.neighbourhood_id,
      serviceCategoryIds: existing.category_ids,
      areaIds: existing.area_ids,
      hours: hasAnyHours(hours) ? hours : defaultHours(),
      document: null,
    };
  } else {
    initial = {
      kinds: [],
      name: "",
      categoryLabel: "",
      description: "",
      logo: null,
      phone: toInput(loginPhone),
      address: "",
      location: null,
      neighbourhoodId: profile.neighbourhood_id ? String(profile.neighbourhood_id) : null,
      serviceCategoryIds: [],
      areaIds: [],
      hours: defaultHours(),
      document: null,
    };
  }

  return (
    <ApplyWizard
      initial={initial}
      resubmit={!!existing}
      rejectionReason={existing?.status === "rejected" ? (existing.rejection_reason ?? "Başvurunda eksik ya da hatalı bilgi var.") : null}
    />
  );
}
