import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div role="status" aria-label="Yükleniyor">
      <div className="px-4 pt-safe">
        <div className="mt-[5px] flex h-(--topbar-h) items-center gap-3">
          <Skeleton className="size-11 rounded-full" />
          <Skeleton className="h-8 w-40" />
        </div>
      </div>
      <div className="px-4 pt-4 pb-nav">
        <Skeleton className="h-11 w-full rounded-lg" />
        <ListSkeleton count={4} variant="card" className="mt-4" />
      </div>
    </div>
  );
}
