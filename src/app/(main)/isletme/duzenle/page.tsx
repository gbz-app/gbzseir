import type { Metadata } from "next";
import { Store } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the profile-business agent replaces this page.
export const metadata: Metadata = { title: "İşletmeyi Düzenle" };

export default function Page() {
  return <ComingSoon title="İşletmeyi Düzenle" icon={Store} backHref="/isletme" />;
}
