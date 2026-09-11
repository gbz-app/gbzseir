import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { routes } from "@/core/routes";
import { requireProfile } from "@/lib/auth/server";
import { WrongVerticalNote } from "@/features/business/components/owner-gate";
import { DoctorsManager } from "@/features/business/components/doctors/doctors-manager";
import { hasDoctors } from "@/features/business/components/doctors/doctor-meta";
import { getDoctorBranches, getOwnerDoctors } from "@/features/business/components/doctors/queries";
import { getOtherOwnedBusinesses, getOwnerBusiness } from "@/features/business/lib/owner-queries";
import { resolveVertical } from "@/features/business/lib/verticals";

export const metadata: Metadata = { title: "Doktorlar", robots: { index: false } };

/** Doctors of a sağlık business: add, edit, order, hide, delete (owner). Other types get the wrong-type note. */
export default async function OwnerDoctorsPage() {
  await requireProfile(routes.business.doctors());
  const b = await getOwnerBusiness();
  if (!b) redirect(routes.business.intro());
  if (b.status !== "approved") redirect(routes.business.root());

  if (!hasDoctors(resolveVertical(b.vertical, b.kinds))) {
    return (
      <>
        <PageHeader title="Doktorlar" subtitle={b.name} backHref={routes.business.root()} />
        <div className="px-4 pt-4 pb-10">
          <WrongVerticalNote
            text="Doktor listesi sağlık işletmeleri içindir."
            alternatives={await getOtherOwnedBusinesses(b.id, (x) => hasDoctors(x.vertical))}
            next={routes.business.doctors()}
          />
        </div>
      </>
    );
  }

  const [initial, branches] = await Promise.all([getOwnerDoctors(b.id).catch(() => []), getDoctorBranches()]);
  return (
    <>
      <PageHeader title="Doktorlar" subtitle={b.name} backHref={routes.business.root()} />
      <div className="px-4 pt-4 pb-10">
        <DoctorsManager businessId={b.id} initial={initial} branches={branches} pageHref={`${routes.businesses.detail(b.slug)}#doktorlar`} />
      </div>
    </>
  );
}
