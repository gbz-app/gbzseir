import { Stethoscope } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { routes } from "@/core/routes";

export default function DoctorNotFound() {
  return (
    <>
      <PageHeader title="Doktor bulunamadı" backHref={routes.doctors.list()} />
      <EmptyState
        icon={Stethoscope}
        title="Bu doktor bulunamadı"
        description="Profil kaldırılmış, gizlenmiş ya da klinik şu an yayında olmayabilir."
        actionLabel="Tüm doktorlar"
        actionHref={routes.doctors.list()}
        className="flex-1 justify-center"
      />
    </>
  );
}
