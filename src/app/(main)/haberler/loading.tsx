import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/core/routes";

/** Mirrors NewsList: header, lead card, rows. */
export default function NewsLoading() {
  return (
    <>
      <PageHeader title="Haberler" subtitle="Gebzem ekibinden" backHref={routes.home()} />
      <div className="flex flex-col gap-2.5 px-4 pt-2" role="status" aria-label="Yükleniyor">
        <div className="overflow-hidden rounded-3xl bg-card" aria-hidden>
          <Skeleton className="aspect-[16/9] w-full rounded-none motion-reduce:animate-none" />
          <div className="px-4 pt-3.5 pb-4">
            <Skeleton className="h-3 w-28 motion-reduce:animate-none" />
            <Skeleton className="mt-3 h-5 w-full motion-reduce:animate-none" />
            <Skeleton className="mt-2 h-5 w-3/4 motion-reduce:animate-none" />
            <Skeleton className="mt-3 h-4 w-11/12 motion-reduce:animate-none" />
          </div>
        </div>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="mt-0.5 flex items-center gap-3.5 rounded-3xl bg-card p-2 pr-4" aria-hidden>
            <Skeleton className="size-[4.5rem] shrink-0 rounded-2xl motion-reduce:animate-none" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-full motion-reduce:animate-none" />
              <Skeleton className="mt-2 h-4 w-2/3 motion-reduce:animate-none" />
              <Skeleton className="mt-2.5 h-3 w-24 motion-reduce:animate-none" />
            </div>
          </div>
        ))}
        <span className="sr-only">Haberler yükleniyor…</span>
      </div>
    </>
  );
}
