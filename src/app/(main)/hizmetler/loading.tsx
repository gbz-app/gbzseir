import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6 px-4 pt-3 pb-nav" role="status" aria-label="Yükleniyor">
      <div>
        <Skeleton className="h-8 w-4/5" />
        <Skeleton className="mt-2 h-4 w-3/4" />
      </div>
      <Skeleton className="h-14 w-full rounded-2xl" />
      <div>
        <Skeleton className="mb-3 h-5 w-40" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-18 rounded-2xl" />
          ))}
        </div>
      </div>
      <div>
        <Skeleton className="mb-3 h-5 w-36" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
      <span className="sr-only">Yükleniyor…</span>
    </div>
  );
}
