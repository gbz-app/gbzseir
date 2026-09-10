import type { Metadata } from "next";
import { Trash2 } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the profile-business agent replaces this page.
export const metadata: Metadata = { title: "Hesabı Sil" };

export default function Page() {
  return <ComingSoon title="Hesabı Sil" icon={Trash2} backHref="/profil/ayarlar" />;
}
