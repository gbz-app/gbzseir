import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, ChevronRight, Clock, EvCharger, Fuel, Globe, Info, Landmark, Mail, MapPin, MapPinOff, Phone, Plug, PlugZap, Printer, Zap } from "lucide-react";
import { CallButton } from "@/components/shared/call-button";
import { DirectionsButton } from "@/components/shared/directions-button";
import { DetailActions, DetailHero, DetailSheet, PRIMARY_CTA, SECONDARY_CTA } from "@/components/shared/detail-hero";
import { JsonLd } from "@/components/seo/json-ld";
import { districtBySlug } from "@/config/districts";
import { APP_NAME, CITY, SITE_URL } from "@/config/site";
import { formatPhoneTR, truncate } from "@/core/format";
import { distanceMeters } from "@/core/geo";
import { routes } from "@/core/routes";
import { GUIDE_KIND_META, OWNERSHIP_LABELS, bankLabel, evOperatorLabel, fuelBrandLabel, guideIcon, sectionFor } from "@/features/guide/lib/constants";
import { getGuideItem, getNearbyGuideItems } from "@/features/guide/lib/queries";
import type { GuideDetailKind } from "@/features/guide/lib/types";
import { loadLabels, toEntry } from "@/features/guide/components/entries";
import { VerifiedChip } from "@/features/guide/components/guide-card";
import { GuideHeroArt, GuideSources, HeaderChip, InfoCard, InfoItem, NearbyGuideList, SheetSection } from "@/features/guide/components/detail-parts";
import { displayUrl, guideSchemaType, isKbbSourced, isOsmHours, isOsmSourced, readableHours, sourceLinks } from "@/features/guide/components/list-config";
import { DistanceLabel } from "@/features/nearby/components/distance-label";
import { InfoReportSheet } from "@/features/nearby/components/info-report-sheet";
import { KIND_META } from "@/features/nearby/config";
import { geoCoordinates, postalAddress } from "@/features/nearby/jsonld";
import { MapPreviewCard } from "@/components/maps/map-preview-card";

export const revalidate = 3600;

/** No paths at build time; every record is rendered on first visit and cached (ISR). */
export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

/** Hero height of the firm page (DetailSkeleton "firm" mirrors it). */
const HERO_HEIGHT = "h-[calc(min(52vh,26rem)_-_100px)] min-h-[188px]";

/** Black "Ara" pill inside an info row. */
const ROW_CALL = "h-9 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background shadow-none hover:bg-foreground/90";

const NEARBY_TITLE: Record<GuideDetailKind, string> = {
  institution: "Yakındaki benzer kurumlar",
  atm: "Yakındaki ATM'ler",
  bank: "Yakındaki banka şubeleri",
  fuel: "Yakındaki akaryakıt istasyonları",
  ev_charge: "Yakındaki şarj istasyonları",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = await getGuideItem(slug).catch(() => null);
  if (!item) return { title: "Kayıt bulunamadı", robots: { index: false } };
  const entry = toEntry(item, await loadLabels());
  const type = entry.type ?? GUIDE_KIND_META[item.kind].label;
  const district = districtBySlug(item.districtId)?.name;
  const title = `${item.name} - ${type}, ${district ?? CITY.province}`;
  const place = district ? `${district}, ${CITY.province}` : CITY.province;
  const description = truncate(
    item.details.description ||
      `${item.name} (${type.toLocaleLowerCase("tr-TR")}, ${place}): adres, telefon${item.details.hours ? ", çalışma saatleri" : ""} ve yol tarifi ${APP_NAME}'de.`,
    160,
  );
  const url = routes.guide.detail(item.slug);
  const image = item.details.photos[0]?.url;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", locale: "tr_TR", siteName: APP_NAME, title, description, url, images: [{ url: image ?? "/icons/og-image.png", alt: item.name }] },
  };
}

/** /kurum/[slug]: resmî kurum, ATM, banka şubesi, akaryakıt or şarj istasyonu on the shared hero + sheet layout. */
export default async function GuideDetailPage({ params }: Props) {
  const { slug } = await params;
  const item = await getGuideItem(slug);
  if (!item || item.kind === "place") notFound();
  const kind = item.kind as GuideDetailKind;

  const labels = await loadLabels();
  const entry = toEntry(item, labels);
  const d = item.details;
  const Icon = guideIcon(entry.icon, KIND_META[kind].icon);
  const hasPoint = typeof item.lat === "number" && typeof item.lng === "number";
  const lat = item.lat as number;
  const lng = item.lng as number;
  const path = routes.guide.detail(item.slug);
  const section = sectionFor(kind, d.category, labels.institution);
  const backHref = section ? routes.guide.category(section.slug) : routes.guide.root();
  const phones = d.phones;
  const phone = phones[0] ?? null;
  const hours = readableHours(d.hours);
  const district = districtBySlug(item.districtId)?.name ?? null;
  // "Darıca, Kocaeli" (just the province when the district is unknown).
  const areaLine = [district, CITY.province].filter(Boolean).join(", ");

  const nearbyRows = hasPoint
    ? await getNearbyGuideItems({ kind, lat, lng, excludeId: item.id, category: kind === "institution" ? d.category : null, limit: 4 })
    : [];
  const nearby = nearbyRows.map((n) => ({
    entry: toEntry(n, labels),
    distanceM: typeof n.lat === "number" && typeof n.lng === "number" ? distanceMeters({ lat, lng }, { lat: n.lat, lng: n.lng }) : null,
  }));

  const sockets = d.sockets.map((s) => (s.count ? `${s.label} × ${s.count}` : s.label)).join(", ");
  const url = `${SITE_URL}${path}`;
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": guideSchemaType(kind, d.category),
    "@id": url,
    name: item.name,
    url,
    address: postalAddress(item.address, item.districtId),
    ...(phone ? { telephone: phone } : {}),
    ...(d.fax ? { faxNumber: d.fax } : {}),
    ...(item.email ? { email: item.email } : {}),
    ...(item.website ? { sameAs: [item.website] } : {}),
    ...(hasPoint ? { geo: geoCoordinates(lat, lng) } : {}),
    ...(isOsmHours(d.hours) ? { openingHours: d.hours } : {}),
    ...(d.description ? { description: d.description } : {}),
    ...(d.photos.length ? { image: d.photos.map((p) => p.url) } : {}),
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Şehir Rehberi", item: `${SITE_URL}${routes.guide.root()}` },
      ...(section ? [{ "@type": "ListItem", position: 2, name: section.title, item: `${SITE_URL}${backHref}` }] : []),
      { "@type": "ListItem", position: section ? 3 : 2, name: item.name, item: url },
    ],
  };

  const hasActions = !!phone || hasPoint;
  const addressLine = item.address ?? (district ? areaLine : null);

  return (
    <>
      <JsonLd data={[jsonLd, breadcrumb]} />

      <DetailHero
        images={d.photos.map((p) => p.url)}
        alt={item.name}
        backHref={backHref}
        shareTitle={item.name}
        shareText={`${item.name} | ${APP_NAME}`}
        favorite={{ targetType: "poi", targetId: item.id }}
        fallbackIcon={<GuideHeroArt icon={Icon} />}
        className={HERO_HEIGHT}
      />

      <DetailSheet className={hasActions ? "pb-36" : "pb-12"}>
        <article className="flex flex-col gap-7">
          <header>
            <div className="flex flex-wrap items-center gap-1.5">
              <HeaderChip icon={Icon}>{entry.type}</HeaderChip>
              {d.ownership ? <HeaderChip tone={d.ownership === "ozel" ? "warm" : "muted"}>{OWNERSHIP_LABELS[d.ownership]}</HeaderChip> : null}
              {item.verifiedAt ? <VerifiedChip className="h-7 px-2.5" /> : null}
            </div>
            <h1 className="mt-3 text-[1.625rem] leading-tight font-semibold tracking-tight text-balance break-words">{item.name}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-4" aria-hidden />
                {areaLine}
              </span>
              <DistanceLabel lat={item.lat} lng={item.lng} withIcon className="font-semibold text-primary" />
            </p>
          </header>

          <SheetSection title="Bilgiler">
            <InfoCard>
              {addressLine ? (
                <InfoItem icon={MapPin} label="Adres">
                  {addressLine}
                </InfoItem>
              ) : null}
              {phones.map((p, i) => (
                <InfoItem
                  key={p}
                  icon={Phone}
                  label={phones.length > 1 ? `Telefon ${i + 1}` : "Telefon"}
                  action={<CallButton phone={p} subjectType="poi" subjectId={item.id} variant="default" size="sm" className={ROW_CALL} />}
                >
                  <span className="tabular-nums">{formatPhoneTR(p)}</span>
                </InfoItem>
              ))}
              {d.fax ? (
                <InfoItem icon={Printer} label="Faks">
                  <span className="tabular-nums">{formatPhoneTR(d.fax)}</span>
                </InfoItem>
              ) : null}
              {item.website ? (
                <InfoItem icon={Globe} label="Web sitesi">
                  <a href={item.website} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
                    {displayUrl(item.website)}
                  </a>
                </InfoItem>
              ) : null}
              {item.email ? (
                <InfoItem icon={Mail} label="E-posta">
                  <a href={`mailto:${item.email}`} className="text-primary underline-offset-2 hover:underline">
                    {item.email}
                  </a>
                </InfoItem>
              ) : null}
              {hours ? (
                <InfoItem icon={Clock} label="Çalışma saatleri">
                  {hours}
                </InfoItem>
              ) : null}
              {(kind === "atm" || kind === "bank") && d.bank ? (
                <InfoItem icon={Landmark} label="Banka">
                  {bankLabel(d.bank)}
                </InfoItem>
              ) : null}
              {kind === "atm" && d.atmCount && d.atmCount > 1 ? (
                <InfoItem icon={Banknote} label="ATM sayısı">
                  {d.atmCount}
                </InfoItem>
              ) : null}
              {kind === "fuel" && d.brand ? (
                <InfoItem icon={Fuel} label="Marka">
                  {fuelBrandLabel(d.brand)}
                </InfoItem>
              ) : null}
              {kind === "ev_charge" && d.operator ? (
                <InfoItem icon={EvCharger} label="Operatör">
                  {evOperatorLabel(d.operator)}
                </InfoItem>
              ) : null}
              {kind === "ev_charge" && sockets ? (
                <InfoItem icon={Plug} label="Soketler">
                  {sockets}
                </InfoItem>
              ) : null}
              {kind === "ev_charge" && d.powerKw ? (
                <InfoItem icon={Zap} label="Güç">
                  {d.powerKw} kW
                </InfoItem>
              ) : null}
              {kind === "ev_charge" && d.capacity ? (
                <InfoItem icon={PlugZap} label="Şarj noktası">
                  {d.capacity}
                </InfoItem>
              ) : null}
            </InfoCard>
            {kind === "ev_charge" ? (
              <p className="mt-2 px-1 text-xs leading-relaxed text-muted-foreground">Soket ve müsaitlik bilgisini operatörün uygulamasından kontrol et.</p>
            ) : phone && kind === "institution" ? (
              <p className="mt-2 px-1 text-xs leading-relaxed text-muted-foreground">Gitmeden önce arayıp çalışma saatlerini sormanı öneririz.</p>
            ) : null}
          </SheetSection>

          {d.description ? (
            <SheetSection title="Hakkında">
              <p className="text-[15px] leading-relaxed whitespace-pre-line text-foreground/90">{d.description}</p>
            </SheetSection>
          ) : null}

          {d.note ? (
            <p className="flex items-start gap-2.5 rounded-2xl bg-muted/70 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              {d.note}
            </p>
          ) : null}

          <SheetSection title="Konum">
            {hasPoint ? (
              <>
                <MapPreviewCard lat={lat} lng={lng} kind={kind} name={item.name} address={addressLine} />
                <DirectionsButton
                  lat={lat}
                  lng={lng}
                  name={item.name}
                  label="Yol tarifi al"
                  variant="secondary"
                  size="lg"
                  subjectType="poi"
                  subjectId={item.id}
                  className="mt-3 w-full"
                />
              </>
            ) : (
              <div className="flex items-start gap-3 rounded-3xl bg-card p-4">
                <MapPinOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 text-sm leading-relaxed">
                  <p className="font-semibold">Harita konumu henüz yok.</p>
                  {item.address ? (
                    <a
                      href={`https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: [item.address, district, CITY.province].filter(Boolean).join(", ") })}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      Adresi Google Haritalar&apos;da ara
                    </a>
                  ) : (
                    <p className="mt-0.5 text-muted-foreground">Konumunu biliyorsan aşağıdan bildirebilirsin.</p>
                  )}
                </div>
              </div>
            )}
          </SheetSection>

          <NearbyGuideList title={NEARBY_TITLE[kind]} items={nearby} />

          {section ? (
            <Link
              href={backHref}
              className="flex min-h-14 items-center gap-3 rounded-2xl bg-card px-4 py-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted/60"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-primary">Tümünü gör</span>
                <span className="block truncate text-xs text-muted-foreground">{section.title}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-primary" aria-hidden />
            </Link>
          ) : null}

          <div className="flex flex-col gap-2">
            <GuideSources
              links={sourceLinks(item.sourceUrls)}
              verifiedAt={item.verifiedAt}
              updatedAt={item.updatedAt}
              osm={isOsmSourced(item)}
              kbb={isKbbSourced(item)}
            />
            <InfoReportSheet subject={`${GUIDE_KIND_META[kind].label}: ${item.name}`} path={path} className="self-start" />
          </div>
        </article>
      </DetailSheet>

      {hasActions ? (
        <DetailActions>
          {phone ? <CallButton phone={phone} subjectType="poi" subjectId={item.id} label="Ara" variant="default" size="lg" className={PRIMARY_CTA} /> : null}
          {hasPoint ? (
            <DirectionsButton
              lat={lat}
              lng={lng}
              name={item.name}
              label="Yol tarifi"
              iconOnly={!!phone}
              variant="secondary"
              size="lg"
              subjectType="poi"
              subjectId={item.id}
              className={phone ? SECONDARY_CTA : PRIMARY_CTA}
            />
          ) : null}
        </DetailActions>
      ) : null}
    </>
  );
}
