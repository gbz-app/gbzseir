import { BadgeCheck, Check, Clock, MapPin, PhoneCall } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DemoBadge } from "@/components/shared/badges";
import { JOB_SAFETY_TEXT, SAFETY_TEXT } from "../constants";
import { listingPriceText } from "../format";
import type { ClassifiedViewModel, JobViewModel } from "../view-models";
import { CompanyCard, DetailTable, MetaRow, SafetyNotice, SellerCard, TextSection } from "./detail-parts";
import { ListingGallery } from "./gallery";

/**
 * E3 body (gallery, price, title, meta, attributes, description, seller, safety box).
 * Used by /ilan/[id] and by the wizard preview (preview: links disabled).
 */
export function ClassifiedDetailView({
  model,
  notice,
  footer,
  preview,
  isDemo,
}: {
  model: ClassifiedViewModel;
  notice?: React.ReactNode;
  footer?: React.ReactNode;
  preview?: boolean;
  /** Sample (seed) listing: "Örnek veri" badge next to the price. */
  isDemo?: boolean;
}) {
  const rows = [{ label: "Kategori", value: model.categoryTrail || model.categoryName }, ...model.attributes.map((a) => ({ label: a.label, value: a.value }))];
  return (
    <article className="flex flex-col">
      <ListingGallery images={model.images} title={model.title} ribbon={model.state === "sold" ? "Satıldı" : null} placeholderIcon={model.categoryIcon} />
      <div className="flex flex-col gap-6 px-4 pt-4 pb-6">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[1.65rem] leading-none font-extrabold tabular-nums">{listingPriceText(model.price)}</p>
            {model.conditionLabel ? (
              <Badge variant="secondary" className="h-6 px-2.5">
                {model.conditionLabel}
              </Badge>
            ) : null}
            {isDemo ? <DemoBadge /> : null}
          </div>
          <p className="mt-2.5 text-xl leading-snug font-bold text-balance break-words">{model.title}</p>
          <MetaRow neighbourhoodName={model.neighbourhoodName} postedAt={model.postedAt} listingNo={model.listingNo} />
        </header>
        {notice}
        <DetailTable id="ozellikler" title="Özellikler" rows={rows} />
        <TextSection id="aciklama" title="Açıklama" text={model.description} />
        <SellerCard seller={model.seller} business={model.business} interactive={!preview} />
        <SafetyNotice text={SAFETY_TEXT} />
        {footer}
      </div>
    </article>
  );
}

/** E4 body (company, position, conditions, benefits, description). */
export function JobDetailView({
  model,
  notice,
  footer,
  preview,
  isDemo,
}: {
  model: JobViewModel;
  notice?: React.ReactNode;
  footer?: React.ReactNode;
  preview?: boolean;
  /** Sample (seed) job ad: "Örnek veri" badge in the chip row. */
  isDemo?: boolean;
}) {
  const location = [model.locationLabel, model.neighbourhoodName ? `${model.neighbourhoodName} Mah.` : null].filter(Boolean).join(" · ");
  const rows = [
    { label: "Çalışma şekli", value: model.workTypeLabel ?? "Belirtilmemiş" },
    { label: "Maaş", value: model.salaryVisible ? model.salaryText : "Görüşülür" },
    { label: "Deneyim", value: model.experienceLabel ?? "Fark etmez" },
    { label: "Konum", value: location || "Gebze" },
    ...(model.sectorName ? [{ label: "Sektör", value: model.sectorName }] : []),
  ];
  return (
    <article className="flex flex-col gap-6 px-4 pt-4 pb-6">
      <CompanyCard company={model.company} interactive={!preview} />
      <header>
        <p className="text-[1.4rem] leading-snug font-extrabold text-balance break-words">{model.title}</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {location ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-semibold">
              <MapPin className="size-4 text-muted-foreground" aria-hidden />
              {location}
            </span>
          ) : null}
          {model.workTypeLabel ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-semibold">
              <Clock className="size-4 text-muted-foreground" aria-hidden />
              {model.workTypeLabel}
            </span>
          ) : null}
          {isDemo ? <DemoBadge className="self-center" /> : null}
        </div>
        <p className="mt-3 text-lg font-extrabold tabular-nums">{model.salaryVisible ? model.salaryText : "Maaş: Görüşülür"}</p>
        <MetaRow neighbourhoodName={null} postedAt={model.postedAt} listingNo={model.listingNo} />
      </header>
      {notice}
      <DetailTable id="is-bilgileri" title="İş bilgileri" rows={rows} />
      {model.benefits.length ? (
        <section aria-labelledby="yan-haklar">
          <h2 id="yan-haklar" className="text-lg font-bold">
            Yan haklar
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {model.benefits.map((b) => (
              <li key={b.value} className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-primary">
                <Check className="size-4" aria-hidden />
                {b.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <TextSection id="is-tanimi" title="İş tanımı" text={model.description} />
      <TextSection id="aranan-nitelikler" title="Aranan nitelikler" text={model.qualifications} />
      <div className="flex gap-3 rounded-2xl bg-info-soft p-4 ring-1 ring-info/15">
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
      {model.company && model.company.verification_level >= 1 ? (
        <p className="-mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <BadgeCheck className="size-4 text-primary" aria-hidden />
          Bu ilan, ekibimizin onayladığı bir işletme hesabından verildi.
        </p>
      ) : null}
      <SafetyNotice title="Dikkat" text={JOB_SAFETY_TEXT} />
      {footer}
    </article>
  );
}
