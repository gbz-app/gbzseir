import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { formatPhoneInputTR, fromSupabasePhone } from "@/core/phone";
import { routes } from "@/core/routes";
import { PageHeader } from "@/components/shared/page-header";
import { ApplyWizard, type ApplyData } from "@/features/business/components/apply-wizard";
import { BusinessLimitNotice } from "@/features/business/components/business-limit";
import { mediaPathFromUrl } from "@/features/business/components/editor/image-picker";
import { isBusinessId } from "@/features/business/lib/active-business";
import { fetchBusinessQuota } from "@/features/business/lib/business-quota";
import { defaultHours, hasAnyHours, parseWorkingHours } from "@/features/business/lib/hours";
import { getOwnerBusiness, getOwnerBusinessList } from "@/features/business/lib/owner-queries";
import { resolveVertical } from "@/features/business/lib/verticals";
import { getAppSettings } from "@/lib/app-settings";
import { ApplicationsPaused } from "@/features/business/components/applications-paused";

export const metadata: Metadata = { title: "Yeni işletme", robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * H1: open a new business (it goes live right away; one per account unless an admin grants more), or finish a
 * pending / rejected business of the user (?duzenle=<id>, pre-filled, type locked). Every "Yeni işletme ekle" entry
 * point lands here: once the account has reached its limit this page explains it and links to the support centre.
 */
export default async function BusinessApplyPage({ searchParams }: Props) {
  const raw = (await searchParams).duzenle;
  const editId = typeof raw === "string" && isBusinessId(raw) ? raw : null;
  const { user, profile } = await requireProfile(editId ? routes.business.applyEdit(editId) : routes.business.apply());
  const existing = editId ? await getOwnerBusiness(editId) : null;
  if (editId && (!existing || (existing.status !== "pending" && existing.status !== "rejected"))) redirect(routes.business.root());
  const owned = editId ? [] : await getOwnerBusinessList();
  // An owner with a suspended business cannot open a new one (apply_business refuses it too).
  if (!editId && owned.some((b) => b.status === "suspended")) redirect(routes.business.root());
  if (!existing && !(await getAppSettings()).businessApplications) return <ApplicationsPaused />;

  if (!existing) {
    // null when it cannot be read: the wizard opens and apply_business still enforces the limit.
    const quota = await fetchBusinessQuota(await createClient());
    if (quota && !quota.canAdd) {
      const unfinished = owned.find((b) => b.status === "pending" || b.status === "rejected");
      return (
        <>
          <PageHeader title="Yeni işletme" backHref={owned.length ? routes.business.root() : routes.profile.root()} hideBottomNav />
          <BusinessLimitNotice limit={quota.limit} unfinishedHref={unfinished ? routes.business.applyEdit(unfinished.id) : null} />
        </>
      );
    }
  }

  const loginPhone = profile.phone ?? fromSupabasePhone(user.phone);
  const toInput = (e164: string | null | undefined) => (e164 ? formatPhoneInputTR(e164) : "");

  let initial: ApplyData;
  if (existing) {
    const hours = parseWorkingHours(existing.working_hours);
    const vertical = resolveVertical(existing.vertical, existing.kinds);
    initial = {
      // The type is locked (apply_business keeps the stored one); kinds follow it.
      kinds: [vertical === "hizmet" ? "service" : "shop"],
      vertical,
      name: existing.name,
      categoryLabel: existing.category_label ?? "",
      description: existing.description ?? "",
      logo: existing.logo_url ? { url: existing.logo_url, path: mediaPathFromUrl(existing.logo_url, user.id) } : null,
      phone: toInput(existing.phone ?? loginPhone),
      address: existing.address ?? "",
      location: existing.lat !== null && existing.lng !== null ? { lat: existing.lat, lng: existing.lng } : null,
      districtId: existing.district_id,
      serviceCategoryIds: existing.category_ids,
      serviceDistrictIds: existing.service_district_ids,
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
      // The user's home district is a good first guess; the pin or the picker can change it.
      districtId: profile.district_id ?? null,
      serviceCategoryIds: [],
      serviceDistrictIds: [],
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
