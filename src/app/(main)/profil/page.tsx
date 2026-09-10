import type { Metadata } from "next";
import { getAppSettings } from "@/lib/app-settings";
import { ProfileScreen } from "@/features/profile/components/profile-screen";

export const metadata: Metadata = { title: "Profil", robots: { index: false } };

/** G1/G2 - Profil (guest and signed-in). */
export default async function ProfilePage() {
  const settings = await getAppSettings();
  return <ProfileScreen applicationsOpen={settings.businessApplications} />;
}
