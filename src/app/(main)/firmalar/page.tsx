import type { Metadata } from "next";
import { Store } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the profile-business agent replaces this page.
export const metadata: Metadata = { title: "Firmalar" };

export default function Page() {
  return <ComingSoon title="Firmalar" icon={Store} description="Gebze'nin onaylı işletmeleri burada listelenecek." backHref="/hizmetler" />;
}
