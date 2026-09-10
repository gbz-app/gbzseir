import type { Metadata } from "next";
import { Store } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the profile-business agent replaces this page.
export const metadata: Metadata = { title: "İşletme Hesabı" };

export default function Page() {
  return <ComingSoon title="İşletme Hesabı" icon={Store} description="İşletme hesabının avantajları ve başvuru burada olacak." backHref="/profil" />;
}
