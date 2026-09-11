import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { routes } from "@/core/routes";
import { requireProfile } from "@/lib/auth/server";
import { WrongVerticalNote } from "@/features/business/components/owner-gate";
import { ServicesManager } from "@/features/business/components/services-manager";
import { getOtherOwnedBusinesses, getOwnerBusiness, getOwnerServices } from "@/features/business/lib/owner-queries";
import { resolveVertical } from "@/features/business/lib/verticals";

export const metadata: Metadata = { title: "Hizmetlerim ve fiyatlar", robots: { index: false } };

/** H8 - Hizmet firmalarının fiyatlı hizmet listesi. */
export default async function OwnerServicesPage() {
  await requireProfile(routes.business.services());
  const b = await getOwnerBusiness();
  if (!b) redirect(routes.business.intro());
  if (b.status !== "approved") redirect(routes.business.root());
  const isService = b.kinds.includes("service") || resolveVertical(b.vertical, b.kinds) === "hizmet";

  return (
    <>
      <PageHeader title="Hizmetlerim ve fiyatlar" subtitle={b.name} backHref={routes.business.root()} />
      <div className="px-4 pt-4 pb-10">
        {isService ? (
          <ServicesManager businessId={b.id} initial={await getOwnerServices(b.id).catch(() => [])} />
        ) : (
          <WrongVerticalNote
            text="Fiyatlı hizmet listesi, hizmet veren firmalar içindir. İşletme türünü Hizmet yaparsan bu bölüm açılır."
            alternatives={await getOtherOwnedBusinesses(b.id, (x) => x.vertical === "hizmet" || x.kinds.includes("service"))}
            next={routes.business.services()}
          />
        )}
      </div>
    </>
  );
}
