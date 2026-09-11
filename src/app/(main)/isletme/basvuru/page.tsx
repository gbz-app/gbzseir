import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/server";
import { formatPhoneInputTR, fromSupabasePhone } from "@/core/phone";
import { routes } from "@/core/routes";
import { ApplyWizard, type ApplyData } from "@/features/business/components/apply-wizard";
import { mediaPathFromUrl } from "@/features/business/components/editor/image-picker";
import { isBusinessId } from "@/features/business/lib/active-business";
import { defaultHours, hasAnyHours, parseWorkingHours } from "@/features/business/lib/hours";
import { getOwnerBusiness, getOwnerBusinessList } from "@/features/business/lib/owner-queries";
import { resolveVertical } from "@/features/business/lib/verticals";
import { getAppSettings } from "@/lib/app-settings";
import { ApplicationsPaused } from "@/features/business/components/applications-paused";

export const metadata: Metadata = { title: "Yeni işletme", robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * H1: open a new business (it goes live right away; an owner can have several), or finish a pending / rejected
 * business of the user (?duzenle=<id>, pre-filled).
 */
export default async function BusinessApplyPage({ searchParams }: Props) {
  const raw = (await searchParams).duzenle;
  const editId = typeof raw === "string" && isBusinessId(raw) ? raw : null;
  const { user, profile } = await requireProfile(editId ? routes.business.applyEdit(editId) : routes.business.apply());
  const existing = editId ? await getOwnerBusiness(editId) : null;
  if (editId && (!existing || (existing.status !== "pending" && existing.status !== "rejected"))) redirect(routes.business.root());
  // An owner with a suspended business cannot open a new one (apply_business refuses it too).
  if (!editId && (await getOwnerBusinessList()).some((b) => b.status === "suspended")) redirect(routes.business.root());
  if (!existing && !(await getAppSettings()).businessApplications) return <ApplicationsPaused />;

  const loginPhone = profile.phone ?? fromSupabasePhone(user.phone);
  const toInput = (e164: string | null | undefined) => (e164 ? formatPhoneInputTR(e164) : "");

  let initial: ApplyData;
  if (existing) {
    const hours = parseWorkingHours(existing.working_hours);
    initial = {
      kinds: existing.kinds,
      vertical: resolveVertical(existing.vertical, existing.kinds),
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
      vertical: null,
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
      businessId={existing?.id ?? null}
      resubmit={!!existing}
      rejectionReason={existing?.status === "rejected" ? (existing.rejection_reason ?? "İşletme bilgilerinde eksik ya da hatalı bilgi var.") : null}
    />
  );
}
