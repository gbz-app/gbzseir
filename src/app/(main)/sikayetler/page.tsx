import type { Metadata } from "next";
import { routes } from "@/core/routes";
import { ExploreHeader } from "@/components/shared/explore-header";
import { ComplaintsBrowser } from "@/features/complaints/complaints-browser";

export const metadata: Metadata = {
  title: "Şikayetler",
  description: "Kocaeli'de yaşadığın sorunu yaz, işletme ve kurumlara iletelim; örnek şikayetler ve çözümleri.",
  alternates: { canonical: routes.content.complaints() },
};

/** Şikayetler (Kategoriler tile): the categories' large-title header and the complaint board. */
export default function ComplaintsPage() {
  return (
    <div className="flex flex-col gap-5 px-4 pb-8">
      <ExploreHeader title="Şikayetler" subtitle="Sorununu yaz, işletme ve kurumlar yanıtlasın" backHref={routes.home()} />
      <ComplaintsBrowser />
    </div>
  );
}
