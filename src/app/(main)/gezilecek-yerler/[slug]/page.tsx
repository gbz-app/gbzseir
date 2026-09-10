import type { Metadata } from "next";
import { Landmark } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the nearby agent replaces this page.
export const metadata: Metadata = { title: "Gezilecek Yer" };

export default function Page() {
  return <ComingSoon title="Gezilecek Yer" icon={Landmark} backHref="/gezilecek-yerler" />;
}
