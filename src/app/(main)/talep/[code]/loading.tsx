import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { CardSkeleton } from "@/components/shared/skeletons";
import { routes } from "@/core/routes";

/** The page's own PageHeader (safe-area aware), so nothing shifts when the request arrives. */
export default function Loading() {
  return (
    <>
      <PageHeader title="Talebim" backHref={routes.profile.requests()} />
      <div className="flex flex-col gap-4 px-4 pt-4 pb-nav" role="status" aria-label="Yükleniyor">
        <CardSkeleton />
        <Skeleton className="h-5 w-40" />
        <CardSkeleton />
        <CardSkeleton />
        <span className="sr-only">Yükleniyor…</span>
      </div>
    </>
  );
}
