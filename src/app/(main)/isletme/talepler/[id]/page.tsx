import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the services agent replaces this page.
export const metadata: Metadata = { title: "Talep Detayı" };

export default function Page() {
  return <ComingSoon title="Talep Detayı" icon={Inbox} backHref="/isletme/talepler" />;
}
