import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the services agent replaces this page.
export const metadata: Metadata = { title: "Taleplerim" };

export default function Page() {
  return <ComingSoon title="Taleplerim" icon={ClipboardList} backHref="/profil" />;
}
