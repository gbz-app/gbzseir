import type { Metadata } from "next";
import { Cross } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the nearby agent replaces this page.
export const metadata: Metadata = { title: "Eczane" };

export default function Page() {
  return <ComingSoon title="Eczane" icon={Cross} backHref="/yakinimda" />;
}
