import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/core/routes";

export default function NewsArticleLoading() {
  return (
    <>
      <PageHeader title="Haberler" backHref={routes.content.news()} />
      <div className="flex flex-col gap-5 px-4 pt-4" role="status" aria-label="Yükleniyor">
        <Skeleton className="aspect-[16/10] w-full rounded-3xl" />
        <div aria-hidden>
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-20 rounded-full" />
            <Skeleton className="h-4 w-36" />
          </div>
          <Skeleton className="mt-4 h-7 w-full" />
          <Skeleton className="mt-2 h-7 w-3/4" />
          <Skeleton className="mt-5 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-11/12" />
          <Skeleton className="mt-2 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-2/3" />
        </div>
        <span className="sr-only">Haber yükleniyor…</span>
      </div>
    </>
  );
}
