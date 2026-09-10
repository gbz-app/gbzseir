import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the services agent replaces this page.
export const metadata: Metadata = { title: "Gelen Talepler" };

export default function Page() {
  return <ComingSoon title="Gelen Talepler" icon={Inbox} backHref="/isletme" />;
}
