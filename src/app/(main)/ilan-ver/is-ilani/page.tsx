import type { Metadata } from "next";
import { Briefcase } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the listings agent replaces this page.
export const metadata: Metadata = { title: "İş İlanı Ver" };

export default function Page() {
  return <ComingSoon title="İş İlanı Ver" icon={Briefcase} backHref="/ilan-ver" />;
}
