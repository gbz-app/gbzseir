import type { Metadata } from "next";
import { BadgeCheck } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the profile-business agent replaces this page.
export const metadata: Metadata = { title: "Başvurun Alındı" };

export default function Page() {
  return <ComingSoon title="Başvurun Alındı" icon={BadgeCheck} backHref="/profil" />;
}
