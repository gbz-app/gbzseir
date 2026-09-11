import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";

/** Same header as the confirmation page, so it does not pop in (and push the content down) when the page arrives. */
export default function Loading() {
  return (
    <>
      <PageHeader title="Talebin alındı" hideBack />
      <div className="flex flex-col items-center gap-4 px-4 pt-8" role="status" aria-label="Yükleniyor">
        <Skeleton className="size-20 rounded-full" />
        <Skeleton className="mt-1 h-7 w-3/4" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="mt-4 h-40 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-full" />
        <span className="sr-only">Yükleniyor…</span>
      </div>
    </>
  );
}
