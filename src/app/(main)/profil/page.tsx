import type { Metadata } from "next";
import { ProfilePlaceholder } from "./profile-placeholder";

// Minimal functional placeholder created by the app-shell agent; the profile-business agent replaces it.
export const metadata: Metadata = { title: "Profil", robots: { index: false } };

export default function ProfilePage() {
  return <ProfilePlaceholder />;
}
