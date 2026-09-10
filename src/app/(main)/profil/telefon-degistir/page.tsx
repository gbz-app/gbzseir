import type { Metadata } from "next";
import { Smartphone } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the profile-business agent replaces this page.
export const metadata: Metadata = { title: "Telefon Numarasını Değiştir" };

export default function Page() {
  return <ComingSoon title="Telefon Numarasını Değiştir" icon={Smartphone} backHref="/profil/ayarlar" />;
}
