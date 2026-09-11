import { BadgeCheck, CalendarDays, Eye, FileText, Hash, Images, MapPin, MapPinned, SlidersHorizontal, Sparkles, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { districtBySlug } from "@/config/districts";
import { formatDate, formatNumber } from "@/core/format";
import { BusinessBadge, DemoBadge } from "@/components/shared/badges";
import { DetailSheet } from "@/components/shared/detail-hero";
import { RelativeTime } from "@/components/shared/relative-time";
import { SAFETY_TEXT, WORK_TYPES, optionLabel } from "../constants";
import { listingPlace, listingPriceText } from "../format";
import type { ClassifiedViewModel, JobViewModel } from "../view-models";
import {
  DetailList,
  DetailSection,
  FactTiles,
  LocationCard,
  SafetyNotice,
  SellerCard,
  TextSection,
  type DetailRow,
  type FactTile,
} from "./detail-parts";
import { categoryIconFor } from "./category-icon";
import { ListingGallery } from "./gallery";
import { attributeIcon, inferAttributeType } from "./listing-icons";
import {
  BenefitGrid,
  EmployerCard,
  JobApplyInfo,
  JobFactChips,
  JobHeroBand,
  JobLogoNotch,
  JobMetaLine,
  SalaryPill,
} from "./job-detail-parts";
import { JobRichText } from "./job-rich-text";

type DetailViewProps<M> = {
  model: M;
  notice?: React.ReactNode;
  footer?: React.ReactNode;
  /** Wizard preview: no hero buttons, links disabled, the title is not the page h1. */
  preview?: boolean;
  /** Sample (seed) listing: "Örnek veri" badge. */
  isDemo?: boolean;
  /** Buttons on top of the hero (ListingHeroBar); none in the preview. */
  heroBar?: React.ReactNode;
  /** listings.view_count (not in the preview). */
  views?: number | null;
  /** Extra classes for the white sheet (e.g. room for the fixed action bar). */
  sheetClassName?: string;
};

const TITLE = "mt-1 text-[1.5rem] leading-tight font-semibold tracking-tight text-balance break-words";

function shortDate(postedAt: string | null): string {
  return postedAt ? formatDate(postedAt) : "Bugün";
}

/** Place · time · badges under the title. */
function MetaLine({ place, postedAt, children }: { place: string; postedAt: string | null; children?: React.ReactNode }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
      <span className="inline-flex min-w-0 items-center gap-1">
        <MapPin className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{place}</span>
      </span>
      {postedAt ? <RelativeTime date={postedAt} /> : null}
      {children}
    </div>
  );
}

/**
 * E3 (firm-detail style): photo hero, white sheet with category, title, price, fact tiles, attributes, description,
 * seller, location and the safety box. Used by /ilan/[id] and by the wizard preview.
 */
export function ClassifiedDetailView({ model, notice, footer, preview, isDemo, heroBar, views, sheetClassName }: DetailViewProps<ClassifiedViewModel>) {
  const Title = preview ? "h2" : "h1";
  const place = listingPlace(model.districtName);
  const hasConditionRow = model.attributes.some((a) => a.key === "durum");
  const categoryIcon = categoryIconFor(model.categoryIcon);
  const tiles: FactTile[] = [
    model.conditionLabel
      ? { label: "durum", value: model.conditionLabel, icon: Sparkles }
      : { label: "kategori", value: model.categoryName, icon: categoryIcon },
    { label: "ilan tarihi", value: shortDate(model.postedAt), icon: CalendarDays },
    views != null
      ? { label: "görüntülenme", value: formatNumber(views), icon: Eye }
      : { label: "fotoğraf", value: formatNumber(model.images.length), icon: Images },
  ];
  const rows: DetailRow[] = [
    { key: "kategori", label: "Kategori", value: model.categoryTrail || model.categoryName, icon: categoryIcon },
    ...(model.conditionLabel && !hasConditionRow ? [{ key: "durum", label: "Durum", value: model.conditionLabel, icon: attributeIcon("durum") }] : []),
    // React key prefixed so a future attribute named "kategori" / "ilan-no" cannot collide with the fixed rows.
    ...model.attributes.map((a) => ({ key: `attr:${a.key}`, label: a.label, value: a.value, icon: attributeIcon(a.key, inferAttributeType(a.value)) })),
    ...(model.listingNo ? [{ key: "ilan-no", label: "İlan no", value: model.listingNo, icon: Hash }] : []),
  ];
  return (
    <article className="flex flex-col">
      <ListingGallery
        images={model.images}
        video={model.video}
        title={model.title}
        ribbon={model.state === "sold" ? "Satıldı" : null}
        placeholderIcon={model.categoryIcon}
        overlay={heroBar}
      />
      <DetailSheet className={cn("flex flex-col gap-6 pb-8", sheetClassName)}>
        <header>
          <p className="text-sm font-semibold text-primary">{model.categoryName}</p>
          <Title className={TITLE}>{model.title}</Title>
          <p className="mt-2 text-[1.75rem] leading-tight font-bold tabular-nums">{listingPriceText(model.price)}</p>
          <MetaLine place={place} postedAt={model.postedAt}>
            {model.business ? <BusinessBadge /> : null}
            {isDemo ? <DemoBadge /> : null}
          </MetaLine>
        </header>
        {notice}
        <FactTiles tiles={tiles} />
        <DetailList id="ozellikler" title="Özellikler" icon={SlidersHorizontal} rows={rows} />
        <TextSection id="aciklama" title="Açıklama" icon={FileText} text={model.description} />
        <DetailSection id="satici" title="Satıcı" icon={UserRound}>
          <SellerCard seller={model.seller} business={model.business} interactive={!preview} />
        </DetailSection>
        <DetailSection id="konum" title="Konum" icon={MapPinned}>
          <LocationCard title={place} note="Kesin adres ilanda paylaşılmaz; buluşma yerini satıcıyla telefonda konuş." />
        </DetailSection>
        <SafetyNotice text={SAFETY_TEXT} />
        {footer}
      </DetailSheet>
    </article>
  );
}

type JobDetailViewProps = DetailViewProps<JobViewModel> & {
  /** Employer extras for the "İşveren" card (business district slug, other open job ads); none in the preview. */
  employer?: { districtId: string | null; openJobs: number | null } | null;
  /** Business phone shown as text in "Başvurmadan önce" (the page passes it for live, non-demo ads only). */
  applyPhone?: string | null;
};

/**
 * E4: short purple band, company logo in a notch on the sheet edge, big title, company + tick, salary pill and a
 * small meta line; key fact chips, benefits grid, rich job text, employer card and one calm "Başvurmadan önce"
 * card. Used by /is-ilani/[id] and by the wizard preview.
 */
export function JobDetailView({ model, notice, footer, preview, isDemo, heroBar, views, sheetClassName, employer, applyPhone }: JobDetailViewProps) {
  const Title = preview ? "h2" : "h1";
  const place = listingPlace(model.districtName);
  const verified = (model.company?.verification_level ?? 0) >= 1;
  const postedLong = model.postedAt ? formatDate(model.postedAt, { month: "long" }) : null;
  const daily = model.workTypeLabel != null && model.workTypeLabel === optionLabel(WORK_TYPES, "gunluk");
  /** Filled / expired / removed: no "call to apply" text (the preview model is always live). */
  const closed = model.state === "filled" || model.state === "expired" || model.state === "deleted";
  return (
    <article className="flex flex-col">
      <JobHeroBand overlay={heroBar} />
      <DetailSheet className={cn("flex flex-col gap-7 pb-8", sheetClassName)}>
        <header>
          <JobLogoNotch company={model.company} />
          <p className="mt-4 text-sm font-semibold text-primary">{model.sectorName ?? "İş ilanı"}</p>
          <Title className="mt-1 text-[1.75rem] leading-[1.15] font-semibold tracking-tight text-balance break-words">{model.title}</Title>
          {model.company ? (
            <p className="mt-2 flex min-w-0 items-center gap-1.5 text-[15px] font-medium text-foreground/75">
              <span className="truncate">{model.company.name}</span>
              {verified ? <BadgeCheck className="size-[18px] shrink-0 text-primary" role="img" aria-label="Onaylı işletme" /> : null}
            </p>
          ) : null}
          <div className="mt-4">
            <SalaryPill visible={model.salaryVisible} text={model.salaryText} daily={daily} />
          </div>
          <JobMetaLine place={place} postedAt={model.postedAt} views={views} isDemo={isDemo} />
        </header>
        {notice}
        <JobFactChips
          workTypeLabel={model.workTypeLabel}
          locationLabel={model.locationLabel}
          districtName={model.districtName}
          experienceLabel={model.experienceLabel}
          benefits={model.benefits}
        />
        {model.benefits.length ? (
          <DetailSection id="yan-haklar" title="Yan haklar">
            <BenefitGrid benefits={model.benefits} />
          </DetailSection>
        ) : null}
        {model.description.trim() ? (
          <DetailSection id="is-tanimi" title="İş tanımı">
            <JobRichText text={model.description} />
          </DetailSection>
        ) : null}
        {model.qualifications.trim() ? (
          <DetailSection id="aranan-nitelikler" title="Aranan nitelikler">
            <JobRichText text={model.qualifications} />
          </DetailSection>
        ) : null}
        {model.company ? (
          <DetailSection id="isveren" title="İşveren">
            <EmployerCard
              company={model.company}
              districtName={districtBySlug(employer?.districtId)?.name}
              openJobs={employer?.openJobs}
              interactive={!preview}
            />
          </DetailSection>
        ) : null}
        <JobApplyInfo isDemo={isDemo} verified={verified} phone={applyPhone} closed={closed} />
        {model.listingNo || footer ? (
          <div className="flex flex-col items-center gap-1">
            {model.listingNo ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                İlan no {model.listingNo}
                {postedLong ? ` · ${postedLong}` : null}
              </p>
            ) : null}
            {footer}
          </div>
        ) : null}
      </DetailSheet>
    </article>
  );
}
