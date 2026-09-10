import { PageHeader } from "@/components/shared/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/core/routes";

export default function Loading() {
  return (
    <>
      <PageHeader title="Firmalar" subtitle="Gebze'nin onaylı işletmeleri" backHref={routes.services.root()} />
      <div className="flex flex-col gap-4 px-4 py-4" aria-busy="true">
        <Skeleton className="h-11 w-full rounded-xl" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
          ))}
        </div>
        <ListSkeleton count={6} />
      </div>
    </>
  );
}
