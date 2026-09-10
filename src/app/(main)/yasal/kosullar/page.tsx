import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the content agent replaces this page.
export const metadata: Metadata = { title: "Kullanım Koşulları" };

export default function Page() {
  return <ComingSoon title="Kullanım Koşulları" icon={FileText} description="Kullanım koşulları hazırlanıyor." />;
}
