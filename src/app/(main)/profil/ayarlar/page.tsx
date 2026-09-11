import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { routes } from "@/core/routes";
import { SettingsScreen } from "./settings-placeholder";

export const metadata: Metadata = { title: "Ayarlar", robots: { index: false } };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Ayarlar" backHref={routes.profile.root()} />
      <SettingsScreen />
    </>
  );
}
