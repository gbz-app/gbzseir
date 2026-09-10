import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col items-center gap-4 px-4 pt-16" role="status" aria-label="Yükleniyor">
      <Skeleton className="size-20 rounded-full" />
      <Skeleton className="h-7 w-3/4" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="mt-4 h-40 w-full rounded-2xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <span className="sr-only">Yükleniyor…</span>
    </div>
  );
}
