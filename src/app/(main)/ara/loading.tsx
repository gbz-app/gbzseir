import { Skeleton } from "@/components/ui/skeleton";

/** /ara while the server part loads: header + input, chips and the category grid. */
export default function SearchLoading() {
  return (
    <div aria-busy="true" aria-label="Yükleniyor">
      <div className="pt-safe">
        <div className="flex h-(--topbar-h) items-center gap-3 px-2">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-4 w-12 rounded-full" />
        </div>
        <div className="px-4 pb-3">
          <Skeleton className="h-13 w-full rounded-full bg-card" />
        </div>
      </div>
      <div className="flex flex-col gap-7 px-4 pt-4 pb-8">
        <div>
          <Skeleton className="mb-3 h-5 w-36 rounded-full" />
          <div className="flex flex-wrap gap-2">
            {[20, 16, 24, 18, 14, 22].map((w, i) => (
              <Skeleton key={i} className="h-10 rounded-full bg-card" style={{ width: `${w * 0.25}rem` }} />
            ))}
          </div>
        </div>
        <div>
          <Skeleton className="mb-3 h-5 w-28 rounded-full" />
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i}>
                <Skeleton className="aspect-square w-full rounded-3xl bg-card" />
                <Skeleton className="mx-auto mt-2 h-3 w-4/5 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
