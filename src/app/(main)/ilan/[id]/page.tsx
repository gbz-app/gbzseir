import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { routes, withQuery } from "@/core/routes";
import { CITY } from "@/config/site";
import { PageHeader } from "@/components/shared/page-header";
import { FavoriteButton } from "@/components/shared/favorite-button";
import { ShareButton } from "@/components/shared/share-button";
import { JsonLd } from "@/components/seo/json-ld";
import { EDITABLE_STATUSES } from "@/features/listings/constants";
import { listingPriceText } from "@/features/listings/format";
import { productJsonLd } from "@/features/listings/seo";
import { getListingDetail, safeCategories } from "@/features/listings/server/queries";
import { classifiedModelFromDetail, displayState } from "@/features/listings/view-models";
import { ClassifiedDetailView } from "@/features/listings/components/detail-views";
import { StatusNotice } from "@/features/listings/components/detail-parts";
import { ActionBarSpacer, ClassifiedActionBar, ListingDetailMenu, ReportFooter, ViewTracker } from "@/features/listings/components/detail-actions";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const d = await getListingDetail(id);
  if (!d || d.type !== "classified") return { title: "İlan bulunamadı", robots: { index: false } };
  const live = displayState(d.status, d.expires_at) === "live";
  return {
    title: `${d.title} - ${listingPriceText(d.price)}`,
    description: (d.description || `${CITY.name}'de ikinci el ilan`).slice(0, 160),
    alternates: { canonical: routes.listings.classified(d.id) },
    robots: live ? undefined : { index: false, follow: true },
    openGraph: d.media[0] ? { images: [{ url: d.media[0].url }] } : undefined,
  };
}

/** E3 - 2. el ilan detay. */
export default async function ClassifiedPage({ params }: Props) {
  const { id } = await params;
  const detail = await getListingDetail(id);
  if (!detail) notFound();
  if (detail.type !== "classified") redirect(routes.listings.job(detail.id));

  const categories = await safeCategories();
  const model = classifiedModelFromDetail(detail, categories);
  const editHref = (EDITABLE_STATUSES as readonly string[]).includes(detail.status)
    ? withQuery(routes.listings.postClassified(), { duzenle: detail.id })
    : null;
  const manageHref = routes.profile.listings();
  const similarHref = routes.listings.root("ikinci-el", { kategori: model.categorySlug });

  return (
    <>
      {model.state === "live" && !detail.is_demo ? <JsonLd data={productJsonLd(detail, model)} /> : null}
      <PageHeader
        title="İlan"
        backHref={routes.listings.root()}
        hideBottomNav
        actions={
          <>
            <FavoriteButton targetType="listing" targetId={detail.id} />
            <ShareButton title={detail.title} iconOnly variant="ghost" />
            <ListingDetailMenu listingId={detail.id} ownerId={detail.owner_id} editHref={editHref} manageHref={manageHref} />
          </>
        }
      />
      <ClassifiedDetailView
        model={model}
        isDemo={detail.is_demo}
        notice={<StatusNotice state={model.state} kind="classified" rejectionReason={detail.rejection_reason} />}
        footer={<ReportFooter listingId={detail.id} ownerId={detail.owner_id} />}
      />
      <ActionBarSpacer />
      <ClassifiedActionBar
        listingId={detail.id}
        ownerId={detail.owner_id}
        priceText={listingPriceText(model.price)}
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
