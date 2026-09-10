import type { Metadata } from "next";
import { BadgeCheck } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the listings agent replaces this page.
export const metadata: Metadata = { title: "İlanın Alındı" };

export default function Page() {
  return <ComingSoon title="İlanın Alındı" icon={BadgeCheck} backHref="/ilanlar" />;
}
