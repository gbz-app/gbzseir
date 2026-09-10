import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the profile-business agent replaces this page.
export const metadata: Metadata = { title: "İşletme Başvurusu" };

export default function Page() {
  return <ComingSoon title="İşletme Başvurusu" icon={FileText} backHref="/isletme/tanitim" />;
}
