import type { Metadata } from "next";
import { routes } from "@/core/routes";
import { ProfilePageHeader } from "@/components/shared/profile-page-header";
import { requireProfile } from "@/lib/auth/server";
import { PhoneChangeFlow } from "@/features/profile/components/phone-change-flow";

export const metadata: Metadata = { title: "Telefon Numarasını Değiştir", robots: { index: false } };

/** B4 - Telefon numarasını değiştir. */
export default async function ChangePhonePage() {
  await requireProfile(routes.profile.changePhone());
  return (
    <>
      <ProfilePageHeader title="Telefon numarası" backHref={routes.profile.edit()} />
      <PhoneChangeFlow />
    </>
  );
}
