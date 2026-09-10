import type { Metadata } from "next";
import { Tag } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the listings agent replaces this page.
export const metadata: Metadata = { title: "İlanlar" };

export default function Page() {
  return <ComingSoon title="İlanlar" icon={Tag} description="2. el ve iş ilanları burada listelenecek." withHeader={false} />;
}
