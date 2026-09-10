import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the profile-business agent replaces this page.
export const metadata: Metadata = { title: "Profili Düzenle" };

export default function Page() {
  return <ComingSoon title="Profili Düzenle" icon={UserRound} backHref="/profil" />;
}
