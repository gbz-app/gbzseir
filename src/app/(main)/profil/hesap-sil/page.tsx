import type { Metadata } from "next";
import { routes } from "@/core/routes";
import { PageHeader } from "@/components/shared/page-header";
import { requireProfile } from "@/lib/auth/server";
import { AccountDeleteFlow } from "@/features/profile/components/account-delete-flow";

export const metadata: Metadata = { title: "Hesabı Sil", robots: { index: false } };

/** G9 - Hesabı sil. */
export default async function DeleteAccountPage() {
  await requireProfile(routes.profile.deleteAccount());
  return (
    <>
      <PageHeader title="Hesabı Sil" backHref={routes.profile.settings()} />
      <AccountDeleteFlow />
    </>
  );
}
