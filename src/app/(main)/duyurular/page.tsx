import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the content agent replaces this page.
export const metadata: Metadata = { title: "Duyurular" };

export default function Page() {
  return <ComingSoon title="Duyurular" icon={Megaphone} />;
}
