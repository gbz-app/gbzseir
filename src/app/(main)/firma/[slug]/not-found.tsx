import { Store } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { routes } from "@/core/routes";

export default function FirmNotFound() {
  return (
    <>
      <PageHeader title="Firma bulunamadı" backHref={routes.businesses.root()} />
      <EmptyState
        icon={Store}
        title="Bu firma bulunamadı"
        description="Firma sayfası kaldırılmış, adresi değişmiş ya da henüz onaylanmamış olabilir."
        actionLabel="Tüm firmalar"
        actionHref={routes.businesses.root()}
        className="flex-1 justify-center"
      />
    </>
  );
}
