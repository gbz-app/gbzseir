import type { Metadata } from "next";
import { BadgeCheck } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the services agent replaces this page.
export const metadata: Metadata = { title: "Talebin Alındı" };

export default function Page() {
  return <ComingSoon title="Talebin Alındı" icon={BadgeCheck} backHref="/hizmetler" />;
}
