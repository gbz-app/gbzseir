import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Hash, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { districtBySlug, districtName } from "@/config/districts";
import { PageHeader } from "@/components/shared/page-header";
import { DirectionsButton } from "@/components/shared/directions-button";
import { ShareButton } from "@/components/shared/share-button";
import { DataSourceNote } from "@/components/shared/data-source-note";
import { JsonLd } from "@/components/seo/json-ld";
import { DetailHero, InfoList, InfoRow, STICKY_BAR_SPACE, StickyActionBar } from "@/features/nearby/components/detail-parts";
import { KindIcon } from "@/features/nearby/components/kind-icon";
import { DistanceLabel } from "@/features/nearby/components/distance-label";
import { NearbyMiniList } from "@/features/nearby/components/nearby-mini-list";
import { InfoReportSheet } from "@/features/nearby/components/info-report-sheet";
import { StopTimetable } from "@/features/nearby/components/stop-timetable";
import { MapPreviewCard } from "@/components/maps/map-preview-card";
import { KBB_SOURCE, OSM_COPYRIGHT_URL, OSM_SOURCE } from "@/features/nearby/config";
import { parseStopDetails } from "@/features/nearby/lib/details";
import { poiJsonLd } from "@/features/nearby/jsonld";
import { getNearbyPois, getPoi } from "@/features/nearby/server/queries";

export const revalidate = 3600;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const poi = await getPoi("bus_stop", id);
  if (!poi) return { title: "Durak bulunamadı", robots: { index: false } };
  return {
    title: `${poi.name} - ${districtName(poi.district_id)}`,
    description: `${poi.name}: yaklaşan otobüsler, geçen hatlar, konum ve yol tarifi.`,
    alternates: { canonical: routes.nearby.stop(poi.slug) },
  };
}

/** D5 - Otobüs durağı detay: yaklaşan otobüsler (tarife), geçen hatlar, harita, yakındaki duraklar. */
export default async function StopPage({ params }: Props) {
  const { id } = await params;
  const poi = await getPoi("bus_stop", id);
  if (!poi) notFound();

  const name = poi.name;
  const stop = parseStopDetails(poi.details);
  const hasPoint = typeof poi.lat === "number" && typeof poi.lng === "number";
  const nearby = hasPoint ? await getNearbyPois({ kind: "bus_stop", lat: poi.lat as number, lng: poi.lng as number, excludeId: poi.id, radiusM: 1500 }) : [];
  const path = routes.nearby.stop(poi.slug);

  return (
    <>
      <JsonLd data={poiJsonLd(poi, "BusStop", path)} />
      <PageHeader title="Durak" backHref={routes.nearby.root("durak")} hideBottomNav actions={<ShareButton title={name} iconOnly />} />
      <div className={cn("flex flex-col gap-5 px-4 pt-4", STICKY_BAR_SPACE)}>
        <DetailHero
          icon={<KindIcon kind="bus_stop" size="lg" />}
          eyebrow={["Otobüs durağı", districtBySlug(poi.district_id)?.name].filter(Boolean).join(" · ")}
          title={name}
          badges={<DistanceLabel lat={poi.lat} lng={poi.lng} withIcon className="text-sm text-muted-foreground" />}
        />
        {poi.address || stop.stopCode ? (
          <InfoList>
            {poi.address ? (
              <InfoRow icon={MapPin} label="Adres">
                {poi.address}
              </InfoRow>
            ) : null}
            {stop.stopCode ? (
              <InfoRow icon={Hash} label="Durak kodu">
                {stop.stopCode}
              </InfoRow>
            ) : null}
          </InfoList>
        ) : null}
        <StopTimetable stopId={stop.stopId} lat={poi.lat} lng={poi.lng} lines={stop.lines} />
        {hasPoint ? <MapPreviewCard lat={poi.lat as number} lng={poi.lng as number} kind="bus_stop" name={name} address={poi.address} /> : null}
        <NearbyMiniList title="Yakındaki duraklar" rows={nearby} />
        <DataSourceNote
          variant="card"
          source={poi.source === "osm" ? OSM_SOURCE : KBB_SOURCE}
          sourceUrl={poi.source === "osm" ? OSM_COPYRIGHT_URL : undefined}
          updatedAt={poi.updated_at}
          note="Sefer saatleri Kocaeli Büyükşehir Belediyesi toplu ulaşım tarifesinden. Canlı araç konumu için e-Komobil uygulamasını kullanabilirsin."
        />
        <InfoReportSheet subject={`Durak: ${name}`} path={path} />
      </div>
      {hasPoint ? (
        <StickyActionBar>
          <DirectionsButton lat={poi.lat as number} lng={poi.lng as number} name={name} size="lg" variant="default" subjectType="poi" subjectId={poi.id} />
        </StickyActionBar>
      ) : null}
    </>
  );
}
