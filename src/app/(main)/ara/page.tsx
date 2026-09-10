import type { Metadata } from "next";
import { Search } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the home-search agent replaces this page.
export const metadata: Metadata = { title: "Ara" };

export default function Page() {
  return <ComingSoon title="Ara" icon={Search} description="Eczane, ilan, usta ve yer araması burada olacak." />;
}
