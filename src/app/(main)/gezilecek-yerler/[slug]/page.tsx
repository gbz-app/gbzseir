import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock, MapPin, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { CITY } from "@/config/site";
import { PageHeader } from "@/components/shared/page-header";
import { CallButton } from "@/components/shared/call-button";
import { DirectionsButton } from "@/components/shared/directions-button";
import { FavoriteButton } from "@/components/shared/favorite-button";
import { ShareButton } from "@/components/shared/share-button";
import { DataSourceNote } from "@/components/shared/data-source-note";
import { JsonLd } from "@/components/seo/json-ld";
import { DetailHero, DetailSection, InfoList, InfoRow, STICKY_BAR_SPACE, StickyActionBar } from "@/features/nearby/components/detail-parts";
import { KindIcon } from "@/features/nearby/components/kind-icon";
import { DistanceLabel } from "@/features/nearby/components/distance-label";
import { PlaceGallery } from "@/features/nearby/components/place-gallery";
import { NearbyMiniList } from "@/features/nearby/components/nearby-mini-list";
import { InfoReportSheet } from "@/features/nearby/components/info-report-sheet";
import { MiniMap } from "@/features/nearby/map/mini-map";
import { KBB_SOURCE, OSM_COPYRIGHT_URL, OSM_SOURCE, placeCategoryMeta } from "@/features/nearby/config";
import { isFreeEntry, parsePlaceDetails } from "@/features/nearby/lib/details";
import { poiJsonLd } from "@/features/nearby/jsonld";
import { getNearbyPois, getPoi } from "@/features/nearby/server/queries";

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const poi = await getPoi("place", slug);
  if (!poi) return { title: "Yer bulunamadı", robots: { index: false } };
  const details = parsePlaceDetails(poi.details);
  const description = details.description ? details.description.slice(0, 160) : `${poi.name}: ${CITY.name}'de gezilecek yer. Konum, açıklama ve yol tarifi.`;
  return {
    title: `${poi.name} - ${CITY.name}`,
    description,
    alternates: { canonical: routes.nearby.place(poi.slug) },
    openGraph: details.photos[0] ? { images: [{ url: details.photos[0].url }] } : undefined,
  };
}

/** D7 - Gezilecek yer detay. */
export default async function PlacePage({ params }: Props) {
  const { slug } = await params;
  const poi = await getPoi("place", slug);
  if (!poi) notFound();

  const details = parsePlaceDetails(poi.details);
  const category = placeCategoryMeta(details.category);
  const hasPoint = typeof poi.lat === "number" && typeof poi.lng === "number";
  const nearby = hasPoint ? await getNearbyPois({ kind: "place", lat: poi.lat as number, lng: poi.lng as number, excludeId: poi.id, radiusM: 10000 }) : [];
  const path = routes.nearby.place(poi.slug);

  const jsonLd = poiJsonLd(poi, "TouristAttraction", path, {
    ...(details.description ? { description: details.description } : {}),
    ...(details.photos.length ? { image: details.photos.map((p) => p.url) } : {}),
    ...(isFreeEntry(details.fee) ? { isAccessibleForFree: true } : {}),
  });

  return (
    <>
      <JsonLd data={jsonLd} />
      <PageHeader
        title={category.label}
        backHref={routes.nearby.places()}
        hideBottomNav
        actions={
          <>
            <FavoriteButton targetType="poi" targetId={poi.id} />
            <ShareButton title={poi.name} iconOnly />
          </>
        }
      />
      <div className={cn("flex flex-col gap-5 pt-4", STICKY_BAR_SPACE)}>
        {details.photos.length ? (
          <div className="px-4">
            <PlaceGallery photos={details.photos} name={poi.name} />
          </div>
        ) : null}
        <div className="flex flex-col gap-5 px-4">
          <DetailHero
            icon={<KindIcon kind="place" icon={category.icon} size="lg" />}
            eyebrow={[category.label, poi.neighbourhood_name].filter(Boolean).join(" · ")}
            title={poi.name}
            badges={<DistanceLabel lat={poi.lat} lng={poi.lng} withIcon className="text-sm text-muted-foreground" />}
          >
            {details.description ? <p className="text-[15px] leading-relaxed whitespace-pre-line text-foreground/90">{details.description}</p> : null}
          </DetailHero>
          {poi.address || details.hours || details.fee ? (
            <InfoList>
              {details.hours ? (
                <InfoRow icon={Clock} label="Ziyaret saatleri">
                  {details.hours}
                </InfoRow>
              ) : null}
              {details.fee ? (
                <InfoRow icon={Ticket} label="Giriş ücreti">
                  {details.fee}
                </InfoRow>
              ) : null}
              {poi.address ? (
                <InfoRow icon={MapPin} label="Adres">
                  {poi.address}
                </InfoRow>
              ) : null}
            </InfoList>
          ) : null}
          {hasPoint ? (
            <DetailSection title="Konum">
              <MiniMap lat={poi.lat as number} lng={poi.lng as number} kind="place" name={poi.name} />
            </DetailSection>
          ) : null}
          <NearbyMiniList title="Yakındaki diğer yerler" rows={nearby} />
          <DataSourceNote
            source={poi.source === "osm" ? OSM_SOURCE : poi.source === "kbb" ? KBB_SOURCE : `${CITY.name} şehir rehberi`}
            sourceUrl={poi.source === "osm" ? OSM_COPYRIGHT_URL : undefined}
            updatedAt={poi.updated_at}
          />
          <InfoReportSheet subject={`Gezilecek yer: ${poi.name}`} path={path} />
        </div>
      </div>
      {hasPoint || poi.phone ? (
        <StickyActionBar>
          {poi.phone ? <CallButton phone={poi.phone} subjectType="poi" subjectId={poi.id} size="lg" variant="outline" /> : null}
          {hasPoint ? <DirectionsButton lat={poi.lat as number} lng={poi.lng as number} name={poi.name} size="lg" variant="default" subjectType="poi" subjectId={poi.id} /> : null}
        </StickyActionBar>
      ) : null}
    </>
  );
}
