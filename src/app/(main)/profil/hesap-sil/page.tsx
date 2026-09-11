import type { Metadata } from "next";
import { routes } from "@/core/routes";
import { ProfilePageHeader } from "@/components/shared/profile-page-header";
import { requireProfile } from "@/lib/auth/server";
import { AccountDeleteFlow } from "@/features/profile/components/account-delete-flow";

export const metadata: Metadata = { title: "Hesabı Sil", robots: { index: false } };

/** G9 - Hesabı sil. */
export default async function DeleteAccountPage() {
  await requireProfile(routes.profile.deleteAccount());
  return (
    <>
      <ProfilePageHeader title="Hesabı sil" backHref={routes.profile.settings()} />
      <AccountDeleteFlow />
    </>
  );
}
