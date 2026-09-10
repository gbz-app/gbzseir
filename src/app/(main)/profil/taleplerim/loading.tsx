import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div role="status" aria-label="Yükleniyor">
      <div className="flex h-(--topbar-h) items-center gap-3 border-b px-3 pt-safe">
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="h-5 w-28" />
      </div>
      <div className="px-4 pt-4 pb-nav">
        <Skeleton className="h-11 w-full rounded-lg" />
        <ListSkeleton count={4} variant="card" className="mt-4" />
      </div>
    </div>
  );
}
