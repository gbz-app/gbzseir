import type { Metadata } from "next";
import { ProfileScreen } from "@/features/profile/components/profile-screen";

export const metadata: Metadata = { title: "Profil", robots: { index: false } };

/** G1/G2 - Profil (guest and signed-in). */
export default function ProfilePage() {
  return <ProfileScreen />;
}
