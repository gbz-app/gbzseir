import { Construction } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export type AdminPageHeaderProps = {
  title: string;
  description?: React.ReactNode;
  /** Buttons on the right (e.g. "Yeni ekle"). */
  actions?: React.ReactNode;
};

/** Title row for admin pages. Server-safe. */
export function AdminPageHeader({ title, description, actions }: AdminPageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** Temporary admin page until the admin agent implements it. */
export function AdminPlaceholder({ title, description }: { title: string; description?: string }) {
  return (
    <>
      <AdminPageHeader title={title} description={description} />
      <div className="rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">
        <EmptyState icon={Construction} tone="warning" title="Yakında" description="Bu yönetim ekranı hazırlanıyor." />
      </div>
    </>
  );
}
