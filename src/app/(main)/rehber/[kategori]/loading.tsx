import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { routes } from "@/core/routes";

/** Same header, search bar, chips and white cards as the guide list page. */
export default function Loading() {
  return (
    <>
      <PageHeader title={<span className="block h-5 w-40 animate-pulse rounded-md bg-muted motion-reduce:animate-none" aria-hidden />} backHref={routes.guide.root()} />
      <div className="flex flex-col gap-3.5 px-4 pt-2 pb-8" aria-busy="true">
        <Skeleton className="h-12 w-full rounded-full motion-reduce:animate-none" />
        <div className="flex gap-2 overflow-hidden py-1">
          {[64, 96, 80, 104, 72].map((w, i) => (
            <Skeleton key={i} className="h-9 shrink-0 rounded-full motion-reduce:animate-none" style={{ width: w }} />
          ))}
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-20 motion-reduce:animate-none" />
          <Skeleton className="h-11 w-44 rounded-full motion-reduce:animate-none" />
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-3xl bg-card p-3">
            <Skeleton className="size-14 shrink-0 rounded-2xl motion-reduce:animate-none" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
              <Skeleton className="mt-2 h-3 w-1/2 motion-reduce:animate-none" />
            </div>
          </div>
        ))}
        <p role="status" className="sr-only">
          Yükleniyor…
        </p>
      </div>
    </>
  );
}
