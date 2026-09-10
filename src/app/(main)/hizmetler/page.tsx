import type { Metadata } from "next";
import { Wrench } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the services agent replaces this page.
export const metadata: Metadata = { title: "Hizmetler" };

export default function Page() {
  return <ComingSoon title="Hizmetler" icon={Wrench} description="Usta ve hizmet kategorileri burada olacak." withHeader={false} />;
}
