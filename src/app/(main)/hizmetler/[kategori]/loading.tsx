import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div role="status" aria-label="Yükleniyor">
      <div className="flex h-(--topbar-h) items-center gap-3 border-b px-3 pt-safe">
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="flex flex-col gap-7 px-4 pt-4 pb-nav">
        <Skeleton className="h-32 w-full rounded-3xl" />
        <div>
          <Skeleton className="mb-3 h-5 w-44" />
          <ListSkeleton count={4} variant="row" className="rounded-2xl bg-card px-4 shadow-soft" />
        </div>
        <div>
          <Skeleton className="mb-3 h-5 w-36" />
          <ListSkeleton count={3} variant="row" />
        </div>
      </div>
    </div>
  );
}
