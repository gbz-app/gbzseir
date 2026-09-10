import { Skeleton } from "@/components/ui/skeleton";
import { CardSkeleton } from "@/components/shared/skeletons";

export default function Loading() {
  return (
    <div role="status" aria-label="Yükleniyor">
      <div className="flex h-(--topbar-h) items-center gap-3 border-b px-3 pt-safe">
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="flex flex-col gap-4 px-4 pt-4 pb-nav">
        <CardSkeleton />
        <CardSkeleton />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
      <span className="sr-only">Yükleniyor…</span>
    </div>
  );
}
