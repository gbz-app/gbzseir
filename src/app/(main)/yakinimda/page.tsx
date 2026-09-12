import type { Metadata } from "next";
import { Suspense } from "react";
import { routes } from "@/core/routes";
import { CITY } from "@/config/site";
import { NearbyExplorer } from "@/features/nearby/components/nearby-explorer";
import { NearbyExplorerSkeleton } from "@/features/nearby/components/nearby-explorer-skeleton";
import { getDutyMode } from "@/features/nearby/server/queries";

export const metadata: Metadata = {
  title: "Yakınımda",
  description: `${CITY.province}'de yakınındaki nöbetçi eczane, eczane, cami, otobüs durağı, gezilecek yer ve işletmeleri haritada gör; tek dokunuşla ara ya da yol tarifi al.`,
  alternates: { canonical: routes.nearby.root() },
};

/**
 * D1 - Yakınımda. Full-screen map (no top bar). Static shell; the explorer reads ?tur= and the location on the client.
 * The duty mode (cached app setting) decides the night default tab and the "Örnek veri" labels.
 */
export default async function NearbyPage() {
  const dutyMode = await getDutyMode();
  return (
    <>
      <h1 className="sr-only">Yakınımda</h1>
      {/* Keeps the map below the status bar / notch now that the page has no top bar. */}
      <div aria-hidden className="pt-safe" />
      {/* The city guide opens from the "Hepsi" chip at the start of the explorer's chip row. */}
      <Suspense fallback={<NearbyExplorerSkeleton />}>
        <NearbyExplorer dutyMode={dutyMode} />
      </Suspense>
    </>
  );
}
