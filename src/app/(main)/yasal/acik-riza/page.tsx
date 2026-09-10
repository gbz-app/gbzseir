import type { Metadata } from "next";
import { Scale } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the content agent replaces this page.
export const metadata: Metadata = { title: "Açık Rıza Metni" };

export default function Page() {
  return <ComingSoon title="Açık Rıza Metni" icon={Scale} />;
}
