import type { Metadata } from "next";
import { Wrench } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the services agent replaces this page.
export const metadata: Metadata = { title: "Hizmet Kategorisi" };

export default function Page() {
  return <ComingSoon title="Hizmet Kategorisi" icon={Wrench} backHref="/hizmetler" />;
}
