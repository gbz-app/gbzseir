import type { Metadata } from "next";
import { ImagePlus } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

// Placeholder created by the app-shell agent; the profile-business agent replaces this page.
export const metadata: Metadata = { title: "Fotoğraflar" };

export default function Page() {
  return <ComingSoon title="Fotoğraflar" icon={ImagePlus} backHref="/isletme" />;
}
