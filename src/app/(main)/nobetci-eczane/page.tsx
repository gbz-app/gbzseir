import type { Metadata } from "next";
import { routes } from "@/core/routes";
import { CITY } from "@/config/site";
import { PageHeader } from "@/components/shared/page-header";
import { DutyBrowser } from "@/features/nearby/components/duty-browser";
import { DutyUnverified } from "@/features/nearby/components/duty-unverified";
import { getDutyData } from "@/features/nearby/server/queries";

export const revalidate = 300;

export const metadata: Metadata = {
  title: `${CITY.name} Nöbetçi Eczaneler`,
  description: `${CITY.name}'deki bugünkü ve yarınki nöbetçi eczaneler: adres, telefon ve yol tarifi. Gitmeden önce eczaneyi arayın.`,
  alternates: { canonical: routes.nearby.dutyPharmacies() },
};

/** D2 - Nöbetçi eczaneler (ISR 5 dk; the list is filtered by the current time on the client). Mode "off": official link only. */
export default async function DutyPharmaciesPage() {
  const data = await getDutyData();
  return (
    <>
      <PageHeader title="Nöbetçi Eczaneler" subtitle={CITY.name} backHref={routes.home()} />
      <div className="px-4 pt-4 pb-6">
        {data.mode === "off" ? (
          <DutyUnverified />
        ) : (
          <DutyBrowser rows={data.rows} serverNow={data.generatedAt} fetchedAt={data.fetchedAt} ok={data.ok} mode={data.mode} />
        )}
      </div>
    </>
  );
}
