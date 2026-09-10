import type { Metadata } from "next";
import { Star } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the profile-business agent replaces this page.
export const metadata: Metadata = { title: "Yorumlar" };

export default function Page() {
  return <ComingSoon title="Yorumlar" icon={Star} backHref="/isletme" />;
}
