import type { Metadata } from "next";
import { Cross } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the nearby agent replaces this page.
export const metadata: Metadata = { title: "Nöbetçi Eczaneler" };

export default function Page() {
  return <ComingSoon title="Nöbetçi Eczaneler" icon={Cross} description="Şu an açık nöbetçi eczaneler burada listelenecek." />;
}
