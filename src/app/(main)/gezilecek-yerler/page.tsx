import type { Metadata } from "next";
import { Landmark } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the nearby agent replaces this page.
export const metadata: Metadata = { title: "Gezilecek Yerler" };

export default function Page() {
  return <ComingSoon title="Gezilecek Yerler" icon={Landmark} description="Gebze'nin tarihi ve doğal güzellikleri burada olacak." />;
}
