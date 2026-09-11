import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 px-4 pt-safe pb-32" aria-busy="true" aria-label="Yükleniyor">
      <div className="flex h-(--topbar-h) items-center">
        <Skeleton className="size-11 rounded-full" />
      </div>
      <Skeleton className="h-8 w-40 rounded-xl" />
      <Skeleton className="h-12 w-full rounded-full" />
      <div className="flex gap-2 overflow-hidden">
        <Skeleton className="h-9 w-16 shrink-0 rounded-full" />
        <Skeleton className="h-9 w-28 shrink-0 rounded-full" />
        <Skeleton className="h-9 w-28 shrink-0 rounded-full" />
      </div>
      <Skeleton className="aspect-[5/4] max-h-[20.8rem] w-full rounded-media" />
      <Skeleton className="aspect-[5/4] max-h-[20.8rem] w-full rounded-media" />
    </div>
  );
}
