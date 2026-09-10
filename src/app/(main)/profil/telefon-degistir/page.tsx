import type { Metadata } from "next";
import { routes } from "@/core/routes";
import { PageHeader } from "@/components/shared/page-header";
import { requireProfile } from "@/lib/auth/server";
import { PhoneChangeFlow } from "@/features/profile/components/phone-change-flow";

export const metadata: Metadata = { title: "Telefon Numarasını Değiştir", robots: { index: false } };

/** B4 - Telefon numarasını değiştir. */
export default async function ChangePhonePage() {
  await requireProfile(routes.profile.changePhone());
  return (
    <>
      <PageHeader title="Telefon Numarası" backHref={routes.profile.edit()} />
      <PhoneChangeFlow />
    </>
  );
}
