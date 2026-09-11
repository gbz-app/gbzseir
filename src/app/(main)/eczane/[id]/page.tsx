import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPin, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { formatPhoneTR } from "@/core/format";
import { districtBySlug, districtName } from "@/config/districts";
import { PageHeader } from "@/components/shared/page-header";
import { CallButton } from "@/components/shared/call-button";
import { DirectionsButton } from "@/components/shared/directions-button";
import { ShareButton } from "@/components/shared/share-button";
import { DataSourceNote } from "@/components/shared/data-source-note";
import { JsonLd } from "@/components/seo/json-ld";
import { DetailHero, InfoList, InfoRow, STICKY_BAR_SPACE, StickyActionBar } from "@/features/nearby/components/detail-parts";
import { KindIcon } from "@/features/nearby/components/kind-icon";
import { DistanceLabel } from "@/features/nearby/components/distance-label";
import { PharmacyDutyBadges, PharmacyDutySchedule } from "@/features/nearby/components/pharmacy-duty";
import { NearbyMiniList } from "@/features/nearby/components/nearby-mini-list";
import { InfoReportSheet } from "@/features/nearby/components/info-report-sheet";
import { MapPreviewCard } from "@/components/maps/map-preview-card";
import { KBB_SOURCE, OSM_COPYRIGHT_URL, OSM_SOURCE } from "@/features/nearby/config";
import { poiJsonLd } from "@/features/nearby/jsonld";
import { getDutyMode, getNearbyPois, getPharmacyDuties, getPoi, renderNow } from "@/features/nearby/server/queries";

export const revalidate = 3600;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const poi = await getPoi("pharmacy", id);
  if (!poi) return { title: "Eczane bulunamadı", robots: { index: false } };
  const district = districtBySlug(poi.district_id)?.name;
  return {
    title: `${poi.name} - ${districtName(poi.district_id)}`,
    description: `${poi.name}${district ? `, ${district}` : ""}: adres, telefon, nöbet günleri ve yol tarifi.`,
    alternates: { canonical: routes.nearby.pharmacy(poi.slug) },
  };
}

/** D3 - Eczane detay. */
export default async function PharmacyPage({ params }: Props) {
  const { id } = await params;
  const poi = await getPoi("pharmacy", id);
  if (!poi) notFound();

  const hasPoint = typeof poi.lat === "number" && typeof poi.lng === "number";
  const [duties, nearby, dutyMode] = await Promise.all([
    getPharmacyDuties(poi.id),
    hasPoint ? getNearbyPois({ kind: "pharmacy", lat: poi.lat as number, lng: poi.lng as number, excludeId: poi.id }) : Promise.resolve([]),
    getDutyMode(),
  ]);
  const now = renderNow();
  const path = routes.nearby.pharmacy(poi.slug);

  return (
    <>
      <JsonLd data={poiJsonLd(poi, "Pharmacy", path)} />
      <PageHeader title="Eczane" backHref={routes.nearby.root("eczane")} hideBottomNav actions={<ShareButton title={poi.name} iconOnly />} />
      <div className={cn("flex flex-col gap-5 px-4 pt-4", STICKY_BAR_SPACE)}>
        <DetailHero
          icon={<KindIcon kind="pharmacy" size="lg" />}
          eyebrow={["Eczane", districtBySlug(poi.district_id)?.name].filter(Boolean).join(" · ")}
          title={poi.name}
          badges={
            <>
              <PharmacyDutyBadges duties={duties} serverNow={now} mode={dutyMode} />
              <DistanceLabel lat={poi.lat} lng={poi.lng} withIcon className="text-sm text-muted-foreground" />
            </>
          }
        />
        {poi.address || poi.phone ? (
          <InfoList>
            {poi.address ? (
              <InfoRow icon={MapPin} label="Adres">
                {poi.address}
              </InfoRow>
            ) : null}
            {poi.phone ? (
              <InfoRow icon={Phone} label="Telefon">
                {formatPhoneTR(poi.phone)}
              </InfoRow>
            ) : null}
          </InfoList>
        ) : null}
        {/* Renders its own "Nöbet günleri" section (it used to be wrapped twice). */}
        <PharmacyDutySchedule duties={duties} serverNow={now} mode={dutyMode} />
        {hasPoint ? <MapPreviewCard lat={poi.lat as number} lng={poi.lng as number} kind="pharmacy" name={poi.name} address={poi.address} /> : null}
        <NearbyMiniList title="Yakındaki eczaneler" rows={nearby} />
        <DataSourceNote
          source={poi.source === "osm" ? OSM_SOURCE : KBB_SOURCE}
          sourceUrl={poi.source === "osm" ? OSM_COPYRIGHT_URL : undefined}
          updatedAt={poi.updated_at}
          callAhead
        />
        <InfoReportSheet subject={`Eczane: ${poi.name}`} path={path} />
      </div>
      <StickyActionBar>
        {poi.phone ? <CallButton phone={poi.phone} subjectType="poi" subjectId={poi.id} size="lg" /> : null}
        {hasPoint ? <DirectionsButton lat={poi.lat as number} lng={poi.lng as number} name={poi.name} size="lg" subjectType="poi" subjectId={poi.id} /> : null}
      </StickyActionBar>
    </>
  );
}
