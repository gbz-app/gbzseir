import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { CITY } from "@/config/site";
import { PageHeader } from "@/components/shared/page-header";
import { DirectionsButton } from "@/components/shared/directions-button";
import { ShareButton } from "@/components/shared/share-button";
import { DataSourceNote } from "@/components/shared/data-source-note";
import { JsonLd } from "@/components/seo/json-ld";
import { DetailHero, DetailSection, InfoList, InfoRow, STICKY_BAR_SPACE, StickyActionBar } from "@/features/nearby/components/detail-parts";
import { KindIcon } from "@/features/nearby/components/kind-icon";
import { DistanceLabel } from "@/features/nearby/components/distance-label";
import { PrayerTimesPanel } from "@/features/nearby/components/prayer-times";
import { NearbyMiniList } from "@/features/nearby/components/nearby-mini-list";
import { InfoReportSheet } from "@/features/nearby/components/info-report-sheet";
import { MapPreviewCard } from "@/components/maps/map-preview-card";
import { KBB_SOURCE, OSM_COPYRIGHT_URL, OSM_SOURCE } from "@/features/nearby/config";
import { poiJsonLd } from "@/features/nearby/jsonld";
import { getNearbyPois, getPoi, renderNow } from "@/features/nearby/server/queries";
import { getPrayerDays } from "@/features/nearby/server/external";

export const revalidate = 3600;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const poi = await getPoi("mosque", id);
  if (!poi) return { title: "Cami bulunamadı", robots: { index: false } };
  return {
    title: `${poi.name} - ${CITY.name}`,
    description: `${poi.name}${poi.neighbourhood_name ? `, ${poi.neighbourhood_name}` : ""}: adres, günün namaz vakitleri ve yol tarifi.`,
    alternates: { canonical: routes.nearby.mosque(poi.slug) },
  };
}

/** D4 - Cami detay (namaz vakitleri dahil). */
export default async function MosquePage({ params }: Props) {
  const { id } = await params;
  const poi = await getPoi("mosque", id);
  if (!poi) notFound();

  const hasPoint = typeof poi.lat === "number" && typeof poi.lng === "number";
  const [days, nearby] = await Promise.all([
    getPrayerDays(),
    hasPoint ? getNearbyPois({ kind: "mosque", lat: poi.lat as number, lng: poi.lng as number, excludeId: poi.id }) : Promise.resolve([]),
  ]);
  const now = renderNow();
  const path = routes.nearby.mosque(poi.slug);

  return (
    <>
      <JsonLd data={poiJsonLd(poi, ["Mosque", "PlaceOfWorship"], path)} />
      <PageHeader title="Cami" backHref={routes.nearby.root("cami")} hideBottomNav actions={<ShareButton title={poi.name} iconOnly />} />
      <div className={cn("flex flex-col gap-5 px-4 pt-4", STICKY_BAR_SPACE)}>
        <DetailHero
          icon={<KindIcon kind="mosque" size="lg" />}
          eyebrow={["Cami", poi.neighbourhood_name].filter(Boolean).join(" · ")}
          title={poi.name}
          badges={<DistanceLabel lat={poi.lat} lng={poi.lng} withIcon className="text-sm text-muted-foreground" />}
        />
        {poi.address ? (
          <InfoList>
            <InfoRow icon={MapPin} label="Adres">
              {poi.address}
            </InfoRow>
          </InfoList>
        ) : null}
        {days.length ? (
          <DetailSection title="Namaz vakitleri">
            <PrayerTimesPanel days={days} serverNow={now} />
          </DetailSection>
        ) : null}
        {hasPoint ? <MapPreviewCard lat={poi.lat as number} lng={poi.lng as number} kind="mosque" name={poi.name} address={poi.address} /> : null}
        <NearbyMiniList title="Yakındaki camiler" rows={nearby} />
        <DataSourceNote
          source={poi.source === "osm" ? OSM_SOURCE : KBB_SOURCE}
          sourceUrl={poi.source === "osm" ? OSM_COPYRIGHT_URL : undefined}
          updatedAt={poi.updated_at}
        />
        <InfoReportSheet subject={`Cami: ${poi.name}`} path={path} />
      </div>
      {hasPoint ? (
        <StickyActionBar>
          <DirectionsButton lat={poi.lat as number} lng={poi.lng as number} name={poi.name} size="lg" variant="default" subjectType="poi" subjectId={poi.id} />
        </StickyActionBar>
      ) : null}
    </>
  );
}
