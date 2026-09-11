import { SearchX } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * notFound() from any (main) page without its own not-found.tsx (cami, durak, eczane, etkinlik, ilan, is-ilani, menu,
 * haberler, hizmetler...). Renders inside the (main) layout, so the bottom nav stays. firma/[slug] keeps its own.
 */
export default function MainNotFound() {
  return (
    <>
      <PageHeader title="Sayfa bulunamadı" backHref="/" />
      <EmptyState
        icon={SearchX}
        title="Aradığın sayfa bulunamadı"
        description="Sayfa kaldırılmış, süresi dolmuş ya da adresi değişmiş olabilir."
        actionLabel="Ana sayfa"
        actionHref="/"
        className="flex-1 justify-center"
      />
    </>
  );
}
