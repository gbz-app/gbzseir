import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/core/routes";

export default function Loading() {
  return (
    <>
      <PageHeader title="Firma" backHref={routes.businesses.root()} hideBottomNav />
      <div className="px-4 pt-4 pb-32" role="status" aria-label="Yükleniyor">
        <div className="relative">
          <Skeleton className="aspect-[16/7] w-full rounded-3xl" />
          <Skeleton className="absolute -bottom-10 left-4 size-24 rounded-3xl ring-4 ring-background" />
        </div>
        <Skeleton className="mt-14 h-7 w-2/3" />
        <Skeleton className="mt-2 h-4 w-1/2" />
        <div className="mt-4 flex gap-3">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-28 rounded-full" />
        </div>
        <Skeleton className="mt-8 h-5 w-32" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-11/12" />
        <Skeleton className="mt-2 h-4 w-3/4" />
        <Skeleton className="mt-8 h-5 w-40" />
        <div className="mt-3 flex gap-2 overflow-hidden">
          <Skeleton className="aspect-[4/3] w-56 shrink-0 rounded-2xl" />
          <Skeleton className="aspect-[4/3] w-56 shrink-0 rounded-2xl" />
        </div>
        <span className="sr-only">Yükleniyor…</span>
      </div>
    </>
  );
}
