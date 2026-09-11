import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Hash, MapPin } from "lucide-react";
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
import { NearbyMiniList } from "@/features/nearby/components/nearby-mini-list";
import { InfoReportSheet } from "@/features/nearby/components/info-report-sheet";
import { MapPreviewCard } from "@/components/maps/map-preview-card";
import { KBB_SOURCE, OSM_COPYRIGHT_URL, OSM_SOURCE, displayStopName } from "@/features/nearby/config";
import { parseStopDetails } from "@/features/nearby/lib/details";
import { poiJsonLd } from "@/features/nearby/jsonld";
import { getNearbyPois, getPoi } from "@/features/nearby/server/queries";

export const revalidate = 3600;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const poi = await getPoi("bus_stop", id);
  if (!poi) return { title: "Durak bulunamadı", robots: { index: false } };
  const name = displayStopName(poi.name, poi.neighbourhood_name);
  return {
    title: `${name} - ${CITY.name}`,
    description: `${name}: konum, geçen hatlar ve yol tarifi.`,
    alternates: { canonical: routes.nearby.stop(poi.slug) },
  };
}

/** D5 - Otobüs durağı detay. */
export default async function StopPage({ params }: Props) {
  const { id } = await params;
  const poi = await getPoi("bus_stop", id);
  if (!poi) notFound();

  const name = displayStopName(poi.name, poi.neighbourhood_name);
  const stop = parseStopDetails(poi.details);
  const hasPoint = typeof poi.lat === "number" && typeof poi.lng === "number";
  const nearby = hasPoint ? await getNearbyPois({ kind: "bus_stop", lat: poi.lat as number, lng: poi.lng as number, excludeId: poi.id, radiusM: 1500 }) : [];
  const path = routes.nearby.stop(poi.slug);

  return (
    <>
      <JsonLd data={poiJsonLd({ ...poi, name }, "BusStop", path)} />
      <PageHeader title="Durak" backHref={routes.nearby.root("durak")} hideBottomNav actions={<ShareButton title={name} iconOnly />} />
      <div className={cn("flex flex-col gap-5 px-4 pt-4", STICKY_BAR_SPACE)}>
        <DetailHero
          icon={<KindIcon kind="bus_stop" size="lg" />}
          eyebrow={["Otobüs durağı", poi.neighbourhood_name].filter(Boolean).join(" · ")}
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
        <DetailSection title="Geçen hatlar">
          {stop.lines.length ? (
            <ul className="flex flex-wrap gap-2">
              {stop.lines.map((l) => (
                <li key={l} className="rounded-full bg-info-soft px-3 py-1.5 text-sm font-bold text-info tabular-nums">
                  {l}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Bu durak için hat bilgisi henüz yok.</p>
          )}
        </DetailSection>
        {hasPoint ? <MapPreviewCard lat={poi.lat as number} lng={poi.lng as number} kind="bus_stop" name={name} address={poi.address} /> : null}
        <NearbyMiniList title="Yakındaki duraklar" rows={nearby} />
        <DataSourceNote
          source={poi.source === "osm" ? OSM_SOURCE : KBB_SOURCE}
          sourceUrl={poi.source === "osm" ? OSM_COPYRIGHT_URL : undefined}
          updatedAt={poi.updated_at}
          note="Canlı sefer saatleri için Kocaeli Büyükşehir Belediyesi'nin e-Komobil uygulamasını kullanabilirsin."
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
