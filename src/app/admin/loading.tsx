import { Skeleton } from "@/components/ui/skeleton";
import { ListSkeleton } from "@/components/shared/skeletons";

/** Loading state for every admin screen (the sidebar stays; only the content area is replaced). */
export default function AdminLoading() {
  return (
    <div>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-2 h-4 w-full max-w-sm" />
      <div className="mt-6 flex gap-2 overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-28 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="mt-6 rounded-2xl bg-card px-4 shadow-soft ring-1 ring-foreground/[0.06]">
        <ListSkeleton count={6} />
      </div>
    </div>
  );
}
