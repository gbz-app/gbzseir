import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the listings agent replaces this page.
export const metadata: Metadata = { title: "İlan Ver" };

export default function Page() {
  return <ComingSoon title="İlan Ver" icon={Plus} description="2. el ya da iş ilanı verme adımları burada olacak." backHref="/ilanlar" />;
}
