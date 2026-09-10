import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the profile-business agent replaces this page.
export const metadata: Metadata = { title: "Bildirimler" };

export default function Page() {
  return <ComingSoon title="Bildirimler" icon={Bell} backHref="/profil" />;
}
