import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { routes } from "@/core/routes";
import { requireProfile } from "@/lib/auth/server";
import { WrongVerticalNote } from "@/features/business/components/owner-gate";
import { RoomsManager } from "@/features/business/components/rooms-manager";
import { getOtherOwnedBusinesses, getOwnerBusiness } from "@/features/business/lib/owner-queries";
import { getBusinessRooms } from "@/features/business/lib/vertical-queries";
import { hasRooms, resolveVertical } from "@/features/business/lib/verticals";
import { getVocabularies } from "@/features/business/lib/vocabularies";

export const metadata: Metadata = { title: "Odalar", robots: { index: false } };

/** H6 - Oda yönetimi (otel). */
export default async function OwnerRoomsPage() {
  await requireProfile(routes.business.rooms());
  const b = await getOwnerBusiness();
  if (!b) redirect(routes.business.intro());
  if (b.status !== "approved") redirect(routes.business.root());
  const vertical = resolveVertical(b.vertical, b.kinds);

  return (
    <>
      <PageHeader title="Odalar" subtitle={b.name} backHref={routes.business.root()} />
      <div className="px-4 pt-4 pb-10">
        {hasRooms(vertical) ? (
          <RoomsManager businessId={b.id} initial={await getBusinessRooms(b.id).catch(() => [])} amenities={(await getVocabularies()).roomAmenities} />
        ) : (
          <WrongVerticalNote
            text="Oda yönetimi otel işletmeleri içindir."
            alternatives={await getOtherOwnedBusinesses(b.id, (x) => hasRooms(x.vertical))}
            next={routes.business.rooms()}
          />
        )}
      </div>
    </>
  );
}
