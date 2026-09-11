import { BadgeCheck, Briefcase, Check, MapPin, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";
import { CITY } from "@/config/site";
import { formatDate, formatNumber } from "@/core/format";
import { BusinessBadge, DemoBadge } from "@/components/shared/badges";
import { DetailSheet } from "@/components/shared/detail-hero";
import { RelativeTime } from "@/components/shared/relative-time";
import { JOB_SAFETY_TEXT, SAFETY_TEXT } from "../constants";
import { listingPriceText } from "../format";
import type { BusinessRef } from "../types";
import type { ClassifiedViewModel, JobViewModel } from "../view-models";
import {
  CompanyCard,
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
import { ListingGallery } from "./gallery";
import { CompanyLogo } from "./listing-cards";

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
  const place = model.neighbourhoodName ? `${model.neighbourhoodName} Mah., ${CITY.name}` : CITY.name;
  const hasConditionRow = model.attributes.some((a) => a.key === "durum");
  const tiles: FactTile[] = [
    model.conditionLabel ? { label: "durum", value: model.conditionLabel } : { label: "kategori", value: model.categoryName },
    { label: "ilan tarihi", value: shortDate(model.postedAt) },
    views != null ? { label: "görüntülenme", value: formatNumber(views) } : { label: "fotoğraf", value: formatNumber(model.images.length) },
  ];
  const rows: DetailRow[] = [
    { label: "Kategori", value: model.categoryTrail || model.categoryName },
    ...(model.conditionLabel && !hasConditionRow ? [{ label: "Durum", value: model.conditionLabel }] : []),
    ...model.attributes.map((a) => ({ label: a.label, value: a.value })),
    ...(model.listingNo ? [{ label: "İlan no", value: model.listingNo }] : []),
  ];
  return (
    <article className="flex flex-col">
      <ListingGallery
        images={model.images}
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
        <DetailList id="ozellikler" title="Özellikler" rows={rows} />
        <TextSection id="aciklama" title="Açıklama" text={model.description} />
        <DetailSection id="satici" title="Satıcı">
          <SellerCard seller={model.seller} business={model.business} interactive={!preview} />
        </DetailSection>
        <DetailSection id="konum" title="Konum">
          <LocationCard title={place} note="Kesin adres ilanda paylaşılmaz; buluşma yerini satıcıyla telefonda konuş." />
        </DetailSection>
        <SafetyNotice text={SAFETY_TEXT} />
        {footer}
      </DetailSheet>
    </article>
  );
}

/** Purple hero of a job ad with the company logo in a white circle. */
function JobHero({ company, overlay }: { company: BusinessRef | null; overlay?: React.ReactNode }) {
  return (
    <div className="relative h-[calc(env(safe-area-inset-top,0px)+16.5rem)] w-full overflow-hidden bg-primary">
      <span aria-hidden className="absolute -top-20 -right-16 size-64 rounded-full bg-white/10" />
      <span aria-hidden className="absolute -bottom-24 -left-14 size-60 rounded-full bg-white/10" />
      <div className="absolute inset-x-0 top-0 bottom-8 flex items-center justify-center px-6 pt-[calc(env(safe-area-inset-top,0px)+2.75rem)]">
        {company ? (
          <CompanyLogo name={company.name} logoUrl={company.logo_url} className="size-24 bg-card text-3xl" />
        ) : (
          <span aria-hidden className="flex size-24 items-center justify-center rounded-full bg-card text-primary">
            <Briefcase className="size-10" strokeWidth={1.75} />
          </span>
        )}
      </div>
      {overlay ? <div className="absolute inset-x-0 top-0 px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">{overlay}</div> : null}
    </div>
  );
}

/**
 * E4 (firm-detail style): logo hero, white sheet with sector, position, company, salary, fact tiles, job facts,
 * benefits, description, company, location and how to apply. Used by /is-ilani/[id] and by the wizard preview.
 */
export function JobDetailView({ model, notice, footer, preview, isDemo, heroBar, views, sheetClassName }: DetailViewProps<JobViewModel>) {
  const Title = preview ? "h2" : "h1";
  const place = [model.locationLabel, model.neighbourhoodName ? `${model.neighbourhoodName} Mah.` : null].filter(Boolean).join(" · ") || CITY.name;
  const verified = (model.company?.verification_level ?? 0) >= 1;
  const tiles: FactTile[] = [
    { label: "çalışma şekli", value: model.workTypeLabel ?? "Belirtilmemiş" },
    { label: "deneyim", value: model.experienceLabel ?? "Fark etmez" },
    views != null ? { label: "görüntülenme", value: formatNumber(views) } : { label: "ilan tarihi", value: shortDate(model.postedAt) },
  ];
  const rows: DetailRow[] = [
    ...(model.sectorName ? [{ label: "Sektör", value: model.sectorName }] : []),
    { label: "Maaş", value: model.salaryVisible ? model.salaryText : "Görüşülür" },
    { label: "Konum", value: place },
    { label: "İlan tarihi", value: model.postedAt ? formatDate(model.postedAt, { month: "long" }) : "Bugün" },
    ...(model.listingNo ? [{ label: "İlan no", value: model.listingNo }] : []),
  ];
  return (
    <article className="flex flex-col">
      <JobHero company={model.company} overlay={heroBar} />
      <DetailSheet className={cn("flex flex-col gap-6 pb-8", sheetClassName)}>
        <header>
          <p className="text-sm font-semibold text-primary">{model.sectorName ?? "İş ilanı"}</p>
          <Title className={TITLE}>{model.title}</Title>
          {model.company ? (
            <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[15px] font-medium text-muted-foreground">
              <span className="truncate">{model.company.name}</span>
              {verified ? <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Onaylı işletme" /> : null}
            </p>
          ) : null}
          <p className="mt-3 text-[1.5rem] leading-tight font-bold tabular-nums">{model.salaryVisible ? model.salaryText : "Maaş görüşülür"}</p>
          <MetaLine place={place} postedAt={model.postedAt}>
            {isDemo ? <DemoBadge /> : null}
          </MetaLine>
        </header>
        {notice}
        <FactTiles tiles={tiles} />
        <DetailList id="is-bilgileri" title="İş bilgileri" rows={rows} />
        {model.benefits.length ? (
          <DetailSection id="yan-haklar" title="Yan haklar">
            <ul className="flex flex-wrap gap-2">
              {model.benefits.map((b) => (
                <li key={b.value} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-card px-3 text-sm font-medium">
                  <Check className="size-4 text-primary" aria-hidden />
                  {b.label}
                </li>
              ))}
            </ul>
          </DetailSection>
        ) : null}
        <TextSection id="is-tanimi" title="İş tanımı" text={model.description} />
        <TextSection id="aranan-nitelikler" title="Aranan nitelikler" text={model.qualifications} />
        {model.company ? (
          <DetailSection id="isveren" title="İşveren">
            <CompanyCard company={model.company} interactive={!preview} />
          </DetailSection>
        ) : null}
        <DetailSection id="konum" title="Konum">
          <LocationCard title={place} note="Tam adresi işverenle telefonda görüşürken öğrenebilirsin." />
        </DetailSection>
        <div className="flex gap-3 rounded-3xl bg-info-soft p-4">
          <PhoneCall className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
          <div className="text-sm leading-relaxed">
            <p className="font-bold">Nasıl başvurulur?</p>
            <p className="mt-0.5 text-muted-foreground">
              {isDemo
                ? "Bu bir örnek ilan, başvuru alınmıyor. Gerçek ilanlarda işletmeyi telefonla arayarak başvurursun."
                : "Başvurmak için işletmeyi telefonla ara. Gebzem üzerinden CV gönderilmez; görüşme bilgisini işletme sana verir."}
            </p>
          </div>
        </div>
        {verified ? (
          <p className="-mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <BadgeCheck className="size-4 shrink-0 text-primary" aria-hidden />
            Bu ilan, ekibimizin onayladığı bir işletme hesabından verildi.
          </p>
        ) : null}
        <SafetyNotice title="Dikkat" text={JOB_SAFETY_TEXT} />
        {footer}
      </DetailSheet>
    </article>
  );
}
