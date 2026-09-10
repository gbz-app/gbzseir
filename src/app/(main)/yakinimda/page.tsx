import type { Metadata } from "next";
import { MapPin } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the nearby agent replaces this page.
export const metadata: Metadata = { title: "Yakınımda" };

export default function Page() {
  return <ComingSoon title="Yakınımda" icon={MapPin} description="Yakınındaki nöbetçi eczane, cami, durak ve gezilecek yerler burada olacak." withHeader={false} />;
}
