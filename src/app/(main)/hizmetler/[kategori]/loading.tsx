import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton } from "@/components/shared/skeletons";
import { routes } from "@/core/routes";

/** The page's own PageHeader (safe-area aware), with the category name as a skeleton line. */
export default function Loading() {
  return (
    <>
      <PageHeader
        title={
          <>
            <span aria-hidden className="block h-5 w-40 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
            <span className="sr-only">Yükleniyor</span>
          </>
        }
        subtitle="Hizmetler"
        backHref={routes.services.root()}
      />
      <div className="flex flex-col gap-7 px-4 pt-4 pb-nav" aria-busy="true">
        <Skeleton className="h-32 w-full rounded-3xl" />
        <div>
          <Skeleton className="mb-3 h-5 w-44" />
          <ListSkeleton count={4} variant="row" className="rounded-2xl bg-card px-4" />
        </div>
        <div>
          <Skeleton className="mb-3 h-5 w-36" />
          <ListSkeleton count={3} variant="row" />
        </div>
      </div>
    </>
  );
}
