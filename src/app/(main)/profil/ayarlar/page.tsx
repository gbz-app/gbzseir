import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { routes } from "@/core/routes";
import { SettingsPlaceholder } from "./settings-placeholder";

// Minimal functional placeholder created by the app-shell agent; the profile-business agent replaces it.
export const metadata: Metadata = { title: "Ayarlar", robots: { index: false } };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Ayarlar" backHref={routes.profile.root()} />
      <SettingsPlaceholder />
    </>
  );
}
