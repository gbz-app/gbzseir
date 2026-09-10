import type { Metadata } from "next";
import { Heart } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the profile-business agent replaces this page.
export const metadata: Metadata = { title: "Favorilerim" };

export default function Page() {
  return <ComingSoon title="Favorilerim" icon={Heart} backHref="/profil" />;
}
