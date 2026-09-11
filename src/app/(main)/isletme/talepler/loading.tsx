import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton } from "@/components/shared/skeletons";
import { routes } from "@/core/routes";

/** The page's own PageHeader (safe-area aware), so nothing shifts when the leads arrive. */
export default function Loading() {
  return (
    <>
      <PageHeader title="Gelen talepler" backHref={routes.business.root()} />
      <div className="px-4 pt-4 pb-nav" aria-busy="true">
        <Skeleton className="h-11 w-full rounded-lg" />
        <ListSkeleton count={4} variant="card" className="mt-4" />
      </div>
    </>
  );
}
