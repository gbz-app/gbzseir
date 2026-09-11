import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/core/routes";

/** Mirrors the article page: full-width cover, chip, title, date line and body lines. */
export default function NewsArticleLoading() {
  return (
    <>
      <PageHeader title="Haberler" backHref={routes.content.news()} />
      <div role="status" aria-label="Yükleniyor">
        <Skeleton className="aspect-[16/10] w-full rounded-none motion-reduce:animate-none" />
        <div className="mx-auto max-w-[40rem] px-5 pt-6" aria-hidden>
          <Skeleton className="h-7 w-20 rounded-full motion-reduce:animate-none" />
          <Skeleton className="mt-4 h-7 w-full motion-reduce:animate-none" />
          <Skeleton className="mt-2 h-7 w-3/4 motion-reduce:animate-none" />
          <Skeleton className="mt-4 h-4 w-44 motion-reduce:animate-none" />
          <Skeleton className="mt-7 h-4 w-full motion-reduce:animate-none" />
          <Skeleton className="mt-3 h-4 w-11/12 motion-reduce:animate-none" />
          <Skeleton className="mt-3 h-4 w-full motion-reduce:animate-none" />
          <Skeleton className="mt-3 h-4 w-2/3 motion-reduce:animate-none" />
        </div>
        <span className="sr-only">Haber yükleniyor…</span>
      </div>
    </>
  );
}
