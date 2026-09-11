import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export type ListSkeletonProps = {
  /** Number of placeholder items (default 4). */
  count?: number;
  /** row: avatar + 2 lines; card: full card; media: image + text (listings); grid: 2-column tiles. */
  variant?: "row" | "card" | "media" | "grid";
  className?: string;
};

/** Single card placeholder. */
export function CardSkeleton({ className, withImage }: { className?: string; withImage?: boolean }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl bg-card p-4", className)} aria-hidden>
      {withImage ? <Skeleton className="-mx-4 -mt-4 mb-4 aspect-[4/3] rounded-none" /> : null}
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="mt-2.5 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-4/5" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-20 rounded-lg" />
      </div>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3" aria-hidden>
      <Skeleton className="size-12 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-2 h-3 w-3/4" />
      </div>
      <Skeleton className="h-9 w-16 rounded-lg" />
    </div>
  );
}

function MediaSkeleton() {
  return (
    <div className="flex gap-3 rounded-2xl bg-card p-3" aria-hidden>
      <Skeleton className="size-24 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 py-1">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="mt-2 h-4 w-1/3" />
        <Skeleton className="mt-4 h-3 w-1/2" />
      </div>
    </div>
  );
}

/** Loading placeholder for lists. Server-safe; use in loading.tsx files. */
export function ListSkeleton({ count = 4, variant = "row", className }: ListSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);
  return (
    <div
      role="status"
      aria-label="Yükleniyor"
      className={cn(
        variant === "grid" ? "grid grid-cols-2 gap-3" : variant === "row" ? "divide-y" : "flex flex-col gap-3",
        className,
      )}
    >
      {items.map((i) =>
        variant === "card" ? (
          <CardSkeleton key={i} />
        ) : variant === "media" ? (
          <MediaSkeleton key={i} />
        ) : variant === "grid" ? (
          <div key={i} className="overflow-hidden rounded-2xl bg-card" aria-hidden>
            <Skeleton className="aspect-square rounded-none" />
            <div className="p-3">
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="mt-2 h-3.5 w-1/2" />
            </div>
          </div>
        ) : (
          <RowSkeleton key={i} />
        ),
      )}
      <span className="sr-only">Yükleniyor…</span>
    </div>
  );
}

/** Full-page loading skeleton (header block + list). */
export function PageSkeleton({ variant = "row" as ListSkeletonProps["variant"] }) {
  return (
    <div className="px-4 py-4" role="status" aria-label="Yükleniyor">
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="mt-2 h-4 w-3/4" />
      <ListSkeleton className="mt-6" variant={variant} />
    </div>
  );
}
