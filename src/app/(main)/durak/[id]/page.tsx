import type { Metadata } from "next";
import { Bus } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the nearby agent replaces this page.
export const metadata: Metadata = { title: "Durak" };

export default function Page() {
  return <ComingSoon title="Durak" icon={Bus} backHref="/yakinimda" />;
}
