import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the content agent replaces this page.
export const metadata: Metadata = { title: "Kaynaklar" };

export default function Page() {
  return <ComingSoon title="Kaynaklar" icon={BookOpen} description="Kullandığımız veri kaynakları ve atıflar burada olacak." />;
}
