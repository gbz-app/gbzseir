import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { routes } from "@/core/routes";
import { requireProfile } from "@/lib/auth/server";
import { getOwnerBusiness } from "@/features/business/lib/owner-queries";
import { getVocabularies } from "@/features/business/lib/vocabularies";
import { EventsManager } from "@/features/events/components/events-manager";
import { getOwnerEvents } from "@/features/events/owner-queries";

export const metadata: Metadata = { title: "Etkinliklerim", robots: { index: false } };

/** H7 - İşletmenin etkinlikleri (her tür işletme). Ekleme ve düzenleme ortak etkinlik sihirbazında. */
export default async function OwnerEventsPage() {
  await requireProfile(routes.business.events());
  const b = await getOwnerBusiness();
  if (!b) redirect(routes.business.intro());
  if (b.status !== "approved") redirect(routes.business.root());
  const [events, vocab] = await Promise.all([getOwnerEvents(b.id).catch(() => []), getVocabularies()]);

  return (
    <>
      <PageHeader title="Etkinliklerim" subtitle={b.name} backHref={routes.business.root()} />
      <div className="px-4 pt-4 pb-10">
        <EventsManager
          business={{ id: b.id, name: b.name, address: b.address, phone: b.phone, lat: b.lat, lng: b.lng, districtId: b.district_id }}
          initial={events}
          categories={vocab.eventCategories}
          wizardCreateHref={routes.events.create({ isletme: b.id })}
        />
      </div>
    </>
  );
}
