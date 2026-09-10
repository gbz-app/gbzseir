import type { Metadata } from "next";
import { Newspaper } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the content agent replaces this page.
export const metadata: Metadata = { title: "Gebze Gündemi" };

export default function Page() {
  return <ComingSoon title="Gebze Gündemi" icon={Newspaper} description="Yerel kaynaklardan derlenen haber başlıkları burada olacak." />;
}
