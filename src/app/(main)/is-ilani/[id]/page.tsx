import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { routes, withQuery } from "@/core/routes";
import { CITY } from "@/config/site";
import { JsonLd } from "@/components/seo/json-ld";
import { EDITABLE_STATUSES } from "@/features/listings/constants";
import { jobPostingJsonLd } from "@/features/listings/seo";
import { getListingDetail, safeCategories } from "@/features/listings/server/queries";
import { getJobEmployerInfo } from "@/features/listings/server/job-employer";
import { displayState, jobModelFromDetail } from "@/features/listings/view-models";
import { JobDetailView } from "@/features/listings/components/detail-views";
import { StatusNotice } from "@/features/listings/components/detail-parts";
import { JobActionBar, ReportFooter, ViewTracker } from "@/features/listings/components/detail-actions";
import { ListingHeroBar } from "@/features/listings/components/hero-bar";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const d = await getListingDetail(id);
  if (!d || d.type !== "job") return { title: "İş ilanı bulunamadı", robots: { index: false } };
  const live = displayState(d.status, d.expires_at) === "live";
  const company = d.business?.name;
  return {
    title: company ? `${d.title} - ${company}` : d.title,
    description: (d.description || `${CITY.name} iş ilanı`).slice(0, 160),
    alternates: { canonical: routes.listings.job(d.id) },
    robots: live ? undefined : { index: false, follow: true },
  };
}

/** E4 - İş ilanı detay (logo-notch hero, fact chips; phone visible without login, no CV / apply form). */
export default async function JobPage({ params }: Props) {
  const { id } = await params;
  const detail = await getListingDetail(id);
  if (!detail) notFound();
  if (detail.type !== "job") redirect(routes.listings.classified(detail.id));

  const [categories, employer] = await Promise.all([
    safeCategories(),
    detail.business_id ? getJobEmployerInfo(detail.business_id, detail.id) : Promise.resolve(null),
  ]);
  const model = jobModelFromDetail(detail, categories);
  const editHref = (EDITABLE_STATUSES as readonly string[]).includes(detail.status)
    ? withQuery(routes.listings.postJob(), { duzenle: detail.id })
    : null;
  const manageHref = routes.profile.jobs();
  const similarHref = routes.listings.jobs({ kategori: model.sectorSlug });

  return (
    <>
      {model.state === "live" && !detail.is_demo ? <JsonLd data={jobPostingJsonLd(detail, model)} /> : null}
      <JobDetailView
        model={model}
        isDemo={detail.is_demo}
        views={detail.view_count}
        sheetClassName="pb-36"
        employer={employer}
        applyPhone={model.state === "live" && !detail.is_demo ? (detail.business?.phone ?? null) : null}
        heroBar={
          <ListingHeroBar
            listingId={detail.id}
            ownerId={detail.owner_id}
            title={detail.title}
            backHref={routes.listings.jobs()}
            editHref={editHref}
            manageHref={manageHref}
            favorite={false}
          />
        }
        notice={<StatusNotice state={model.state} kind="job" rejectionReason={detail.rejection_reason} />}
        footer={<ReportFooter listingId={detail.id} ownerId={detail.owner_id} />}
      />
      <JobActionBar
        listingId={detail.id}
        ownerId={detail.owner_id}
        // Sample (demo) numbers never reach the client; the bar shows the grey "Örnek kayıt - aranamaz" pill instead.
        phone={detail.is_demo ? null : (detail.business?.phone ?? null)}
        state={model.state}
        similarHref={similarHref}
        editHref={editHref}
        manageHref={manageHref}
        isDemo={detail.is_demo}
      />
      {model.state === "live" ? <ViewTracker listingId={detail.id} /> : null}
    </>
  );
}
