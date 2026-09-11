import type { Metadata } from "next";
import { ProfilePageHeader } from "@/components/shared/profile-page-header";
import { routes } from "@/core/routes";
import { SettingsScreen } from "./settings-placeholder";

export const metadata: Metadata = { title: "Ayarlar", robots: { index: false } };

export default function SettingsPage() {
  return (
    <>
      <ProfilePageHeader title="Ayarlar" backHref={routes.profile.root()} />
      <SettingsScreen />
    </>
  );
}
