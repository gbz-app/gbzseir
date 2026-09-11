import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock, Globe, History, Mail, MapPin, MapPinOff, Phone, Ticket } from "lucide-react";
import { CallButton } from "@/components/shared/call-button";
import { DirectionsButton } from "@/components/shared/directions-button";
import { DetailActions, DetailHero, DetailSheet, PRIMARY_CTA, SECONDARY_CTA } from "@/components/shared/detail-hero";
import { JsonLd } from "@/components/seo/json-ld";
import { APP_NAME, CITY, SITE_URL } from "@/config/site";
import { formatPhoneTR, truncate } from "@/core/format";
import { distanceMeters } from "@/core/geo";
import { routes } from "@/core/routes";
import { getGuideItem, getNearbyGuideItems } from "@/features/guide/lib/queries";
import { loadLabels, toEntry } from "@/features/guide/components/entries";
import { GuideHeroArt, GuideSources, HeaderChip, InfoCard, InfoItem, NearbyGuideList, PhotoCreditLine, SheetSection } from "@/features/guide/components/detail-parts";
import { displayUrl, isKbbSourced, isOsmSourced, readableHours, sourceLinks } from "@/features/guide/components/list-config";
import { DistanceLabel } from "@/features/nearby/components/distance-label";
import { InfoReportSheet } from "@/features/nearby/components/info-report-sheet";
import { placeCategoryMeta } from "@/features/nearby/config";
import { geoCoordinates, postalAddress } from "@/features/nearby/jsonld";
import { isFreeEntry } from "@/features/nearby/lib/details";
import { MapPreviewCard } from "@/components/maps/map-preview-card";

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

/** Black "Ara" pill inside an info row. */
const ROW_CALL = "h-9 rounded-full bg-foreground px-4 text-[13px] font-semibold text-background shadow-none hover:bg-foreground/90";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = await getGuideItem(slug, "place").catch(() => null);
  if (!item) return { title: "Yer bulunamadı", robots: { index: false } };
  const d = item.details;
  const title = `${item.name} - ${CITY.name}`;
  const description = truncate(d.description || `${item.name}: ${CITY.name}'de gezilecek yer. Konum, açıklama ve yol tarifi.`, 160);
  const url = routes.nearby.place(item.slug);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "tr_TR",
      siteName: APP_NAME,
      title,
      description,
      url,
      images: [{ url: d.photos[0]?.url ?? "/icons/og-image.png", alt: d.photos[0]?.alt ?? item.name }],
    },
  };
}

/** D7 - Gezilecek yer: firm-style profile (photo hero with credits, sheet with facts, map, sources). */
export default async function PlacePage({ params }: Props) {
  const { slug } = await params;
  const item = await getGuideItem(slug, "place");
  if (!item) notFound();

  const labels = await loadLabels();
  const entry = toEntry(item, labels);
  const d = item.details;
  const meta = placeCategoryMeta(d.category, labels.place);
  const hasPoint = typeof item.lat === "number" && typeof item.lng === "number";
  const lat = item.lat as number;
  const lng = item.lng as number;
  const path = routes.nearby.place(item.slug);
  const phone = d.phones[0] ?? null;
  const hours = readableHours(d.hours);
  const hood = item.neighbourhoodName;

  const nearbyRows = hasPoint ? await getNearbyGuideItems({ kind: "place", lat, lng, excludeId: item.id, radiusM: 10000, limit: 4 }) : [];
  const nearby = nearbyRows.map((n) => ({
    entry: toEntry(n, labels),
    distanceM: typeof n.lat === "number" && typeof n.lng === "number" ? distanceMeters({ lat, lng }, { lat: n.lat, lng: n.lng }) : null,
  }));

  const url = `${SITE_URL}${path}`;
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": meta.value === "tarihi" ? ["TouristAttraction", "LandmarksOrHistoricalBuildings"] : "TouristAttraction",
    "@id": url,
    name: item.name,
    url,
    address: postalAddress(item.address),
    ...(phone ? { telephone: phone } : {}),
    ...(hasPoint ? { geo: geoCoordinates(lat, lng) } : {}),
    ...(d.description ? { description: d.description } : {}),
    ...(d.photos.length ? { image: d.photos.map((p) => p.url) } : {}),
    ...(isFreeEntry(d.fee) ? { isAccessibleForFree: true } : {}),
    ...(item.website ? { sameAs: [item.website] } : {}),
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Gezilecek yerler", item: `${SITE_URL}${routes.nearby.places()}` },
      { "@type": "ListItem", position: 2, name: item.name, item: url },
    ],
  };

  const hasActions = !!phone || hasPoint;
  const hasInfo = !!(d.period || hours || d.fee || item.address || phone || item.website || item.email);

  return (
    <>
      <JsonLd data={[jsonLd, breadcrumb]} />

      <DetailHero
        images={d.photos.map((p) => p.url)}
        alt={d.photos[0]?.alt ?? item.name}
        backHref={routes.nearby.places()}
        shareTitle={item.name}
        shareText={`${item.name} | ${APP_NAME}`}
        favorite={{ targetType: "poi", targetId: item.id }}
        fallbackIcon={<GuideHeroArt icon={meta.icon} gradient={meta.gradient} />}
      />

      <DetailSheet className={hasActions ? "pb-36" : "pb-12"}>
        <article className="flex flex-col gap-7">
          <header>
            <div className="flex flex-wrap items-center gap-1.5">
              <HeaderChip icon={meta.icon}>{entry.type}</HeaderChip>
            </div>
            <h1 className="mt-3 text-[1.625rem] leading-tight font-semibold tracking-tight text-balance break-words">{item.name}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-4" aria-hidden />
                {hood ? `${hood} Mah., ` : ""}
                {CITY.name}
              </span>
              <DistanceLabel lat={item.lat} lng={item.lng} withIcon className="font-semibold text-primary" />
            </p>
            <PhotoCreditLine photos={d.photos} className="mt-2" />
          </header>

          {d.description ? (
            <SheetSection title="Hakkında">
              <p className="text-[15px] leading-relaxed whitespace-pre-line text-foreground/90">{d.description}</p>
            </SheetSection>
          ) : null}

          {hasInfo ? (
            <SheetSection title="Ziyaret bilgileri">
              <InfoCard>
                {d.period ? (
                  <InfoItem icon={History} label="Dönem">
                    {d.period}
                  </InfoItem>
                ) : null}
                {hours ? (
                  <InfoItem icon={Clock} label="Ziyaret saatleri">
                    {hours}
                  </InfoItem>
                ) : null}
                {d.fee ? (
                  <InfoItem icon={Ticket} label="Giriş ücreti">
                    {d.fee}
                  </InfoItem>
                ) : null}
                {item.address ? (
                  <InfoItem icon={MapPin} label="Adres">
                    {item.address}
                  </InfoItem>
                ) : null}
                {phone ? (
                  <InfoItem icon={Phone} label="Telefon" action={<CallButton phone={phone} subjectType="poi" subjectId={item.id} variant="default" size="sm" className={ROW_CALL} />}>
                    <span className="tabular-nums">{formatPhoneTR(phone)}</span>
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
              </InfoCard>
            </SheetSection>
          ) : null}

          <SheetSection title="Konum">
            {hasPoint ? (
              <>
                <MapPreviewCard lat={lat} lng={lng} kind="place" name={item.name} address={item.address} />
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
                <p className="min-w-0 text-sm leading-relaxed">
                  <span className="block font-semibold">Harita konumu henüz yok.</span>
                  <span className="text-muted-foreground">Konumunu biliyorsan aşağıdan bildirebilirsin.</span>
                </p>
              </div>
            )}
          </SheetSection>

          <NearbyGuideList title="Yakındaki diğer yerler" items={nearby} />

          <div className="flex flex-col gap-2">
            <GuideSources
              links={sourceLinks(item.sourceUrls)}
              verifiedAt={item.verifiedAt}
              updatedAt={item.updatedAt}
              osm={isOsmSourced(item)}
              kbb={isKbbSourced(item)}
              photos={d.photos}
            />
            <InfoReportSheet subject={`Gezilecek yer: ${item.name}`} path={path} className="self-start" />
          </div>
        </article>
      </DetailSheet>

      {hasActions ? (
        <DetailActions>
          {hasPoint ? (
            <DirectionsButton
              lat={lat}
              lng={lng}
              name={item.name}
              label="Yol tarifi"
              variant="default"
              size="lg"
              subjectType="poi"
              subjectId={item.id}
              className={PRIMARY_CTA}
            />
          ) : null}
          {phone ? (
            <CallButton
              phone={phone}
              subjectType="poi"
              subjectId={item.id}
              label="Ara"
              iconOnly={hasPoint}
              variant={hasPoint ? "secondary" : "default"}
              size="lg"
              className={hasPoint ? SECONDARY_CTA : PRIMARY_CTA}
            />
          ) : null}
        </DetailActions>
      ) : null}
    </>
  );
}
