import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";

/** loading.tsx content for poi detail pages. */
export function DetailSkeleton({ title, backHref, withPhoto }: { title: string; backHref?: string; withPhoto?: boolean }) {
  return (
    <>
      <PageHeader title={title} backHref={backHref} hideBottomNav />
      <div className="flex flex-col gap-4 px-4 pt-4 pb-10" role="status" aria-label="Yükleniyor">
        {withPhoto ? <Skeleton className="-mx-4 -mt-4 aspect-[16/10] rounded-none" /> : null}
        <div className="rounded-3xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.06]">
          <div className="flex gap-3.5">
            <Skeleton className="size-14 rounded-2xl" />
            <div className="flex-1">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="mt-2 h-6 w-3/4" />
              <Skeleton className="mt-3 h-6 w-24 rounded-full" />
            </div>
          </div>
        </div>
        <div className="divide-y rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="size-5 rounded" />
              <div className="flex-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="mt-1.5 h-4 w-4/5" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="aspect-[16/9] w-full rounded-2xl" />
        <span className="sr-only">Yükleniyor…</span>
      </div>
    </>
  );
}
