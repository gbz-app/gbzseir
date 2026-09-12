import type { Metadata } from "next";
import { Suspense } from "react";
import { routes } from "@/core/routes";
import { CITY } from "@/config/site";
import { getInstitutionCategories } from "@/features/guide/lib/queries";
import { ExploreMap } from "@/features/nearby/components/explore-map";
import { NearbyExplorerSkeleton } from "@/features/nearby/components/nearby-explorer-skeleton";
import { getDutyMode } from "@/features/nearby/server/queries";

export const metadata: Metadata = {
  title: "Yakınımda",
  description: `${CITY.province}'de yakınındaki nöbetçi eczane, eczane, cami, otobüs durağı, ATM, banka, akaryakıt, resmî kurum ve gezilecek yerleri haritada gör; tek dokunuşla ara ya da yol tarifi al.`,
  alternates: { canonical: routes.nearby.root() },
};

/**
 * D1 - Keşfet (Yakınımda): the one explore screen, the same map as the Şehir Rehberi lists (owner 12.09). Full-screen
 * map (no top bar); the screen reads ?tur= / ?kategori= and the location on the client. The duty mode (cached app
 * setting) decides the night default and the "Örnek veri" labels; the institution categories let the URL be read the
 * way /rehber/[kategori] reads its path.
 */
export default async function NearbyPage() {
  const [dutyMode, defs] = await Promise.all([getDutyMode(), getInstitutionCategories()]);
  return (
    <>
      <h1 className="sr-only">Yakınımda</h1>
      {/* Keeps the map below the status bar / notch now that the page has no top bar. */}
      <div aria-hidden className="pt-safe" />
      <Suspense fallback={<NearbyExplorerSkeleton />}>
        <ExploreMap dutyMode={dutyMode} defs={defs} />
      </Suspense>
    </>
  );
}
