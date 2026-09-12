import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Globe, MapPin, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { formatPhoneTR } from "@/core/format";
import { telHref } from "@/core/phone";
import { districtBySlug, districtName } from "@/config/districts";
import { HideBottomNav } from "@/components/layout/nav-visibility";
import { ExploreHeader } from "@/components/shared/explore-header";
import { CallButton } from "@/components/shared/call-button";
import { DirectionsButton } from "@/components/shared/directions-button";
import { ShareButton } from "@/components/shared/share-button";
import { DataSourceNote } from "@/components/shared/data-source-note";
import { JsonLd } from "@/components/seo/json-ld";
import { InfoList, InfoRow, STICKY_BAR_SPACE, StickyActionBar } from "@/features/nearby/components/detail-parts";
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

/** Round translucent button next to the title, like the back button of ExploreHeader. */
const HEADER_BUTTON =
  "flex size-11 shrink-0 items-center justify-center rounded-full border-0 bg-foreground/[0.06] text-foreground shadow-none backdrop-blur-md transition-colors outline-none hover:bg-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50";

/** A website stored with the mosque (details.website / url / web), http(s) only. */
function websiteOf(details: unknown): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const d = details as Record<string, unknown>;
  for (const key of ["website", "url", "web", "contact:website"]) {
    const v = d[key];
    if (typeof v === "string" && /^https?:\/\/\S+$/i.test(v.trim())) return v.trim();
  }
  return null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const poi = await getPoi("mosque", id);
  if (!poi) return { title: "Cami bulunamadı", robots: { index: false } };
  const district = districtBySlug(poi.district_id)?.name;
  return {
    title: `${poi.name} - ${districtName(poi.district_id)}`,
    description: `${poi.name}${district ? `, ${district}` : ""}: adres, telefon, günün namaz vakitleri, harita ve yol tarifi.`,
    alternates: { canonical: routes.nearby.mosque(poi.slug) },
  };
}

/**
 * D4 - Cami detay, minimal: the categories' large-title header (back, share), address / phone / website, today's prayer
 * times, the map shown at once, nearby mosques and the source; "Yol tarifi" and the phone number at the bottom.
 */
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
  const district = districtBySlug(poi.district_id)?.name;
  const website = websiteOf(poi.details);

  return (
    <>
      <JsonLd data={poiJsonLd(poi, ["Mosque", "PlaceOfWorship"], path)} />
      <HideBottomNav />
      <div className={cn("flex flex-col gap-5 px-4", STICKY_BAR_SPACE)}>
        <ExploreHeader
          title={poi.name}
          backHref={routes.nearby.root("cami")}
          subtitle={
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{["Cami", district].filter(Boolean).join(" · ")}</span>
              <DistanceLabel lat={poi.lat} lng={poi.lng} withIcon className="font-semibold text-primary" />
            </span>
          }
          right={<ShareButton title={poi.name} iconOnly variant="ghost" label="Paylaş" className={HEADER_BUTTON} />}
        />

        <InfoList>
          <InfoRow icon={MapPin} label="Adres">
            {poi.address ?? (district ? `${district}, Kocaeli` : "Adres bilgisi yok")}
          </InfoRow>
          {poi.phone ? (
            <InfoRow icon={Phone} label="Telefon">
              <a href={telHref(poi.phone)} className="tabular-nums underline-offset-2 hover:underline">
                {formatPhoneTR(poi.phone)}
              </a>
            </InfoRow>
          ) : null}
          {website ? (
            <InfoRow icon={Globe} label="İnternet sitesi">
              <a href={website} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
                {hostOf(website)}
              </a>
            </InfoRow>
          ) : null}
        </InfoList>

        {days.length ? <PrayerTimesPanel days={days} serverNow={now} /> : null}
        {hasPoint ? <MapPreviewCard lat={poi.lat as number} lng={poi.lng as number} kind="mosque" name={poi.name} address={poi.address} autoLoad /> : null}
        <NearbyMiniList title="Yakındaki camiler" rows={nearby} />
        <DataSourceNote
          variant="card"
          source={poi.source === "osm" ? OSM_SOURCE : KBB_SOURCE}
          sourceUrl={poi.source === "osm" ? OSM_COPYRIGHT_URL : undefined}
          updatedAt={poi.updated_at}
        />
        <InfoReportSheet subject={`Cami: ${poi.name}`} path={path} />
      </div>
      {hasPoint || poi.phone ? (
        <StickyActionBar>
          {hasPoint ? (
            <DirectionsButton
              lat={poi.lat as number}
              lng={poi.lng as number}
              name={poi.name}
              size="lg"
              variant="secondary"
              subjectType="poi"
              subjectId={poi.id}
              className="h-13 rounded-2xl text-base font-semibold"
            />
          ) : null}
          {poi.phone ? (
            <CallButton
              phone={poi.phone}
              subjectType="poi"
              subjectId={poi.id}
              showNumber
              variant="default"
              size="lg"
              className="h-13 rounded-2xl bg-foreground text-base font-semibold text-background tabular-nums shadow-none hover:bg-foreground/90"
            />
          ) : null}
        </StickyActionBar>
      ) : null}
    </>
  );
}
