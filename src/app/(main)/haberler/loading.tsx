import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function NewsLoading() {
  return (
    <>
      <PageHeader title="Gebze Gündemi" subtitle="Gebzem ve yerel kaynaklar" />
      <div className="flex flex-col gap-4 px-4 pt-4" role="status" aria-label="Yükleniyor">
        <Skeleton className="h-4 w-4/5" />
        <div className="flex gap-2 overflow-hidden" aria-hidden>
          {[16, 20, 16, 18].map((w, i) => (
            <Skeleton key={i} className="h-9 shrink-0 rounded-full" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
        <div className="rounded-3xl bg-card p-5 shadow-card ring-1 ring-foreground/[0.06]" aria-hidden>
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="mt-4 h-6 w-full" />
          <Skeleton className="mt-2 h-6 w-4/5" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-11/12" />
          <Skeleton className="mt-2 h-4 w-2/3" />
          <div className="mt-5 flex items-center justify-between">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-10 w-28 rounded-xl" />
          </div>
        </div>
        <div className="divide-y rounded-2xl bg-card px-4 shadow-soft ring-1 ring-foreground/[0.06]" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="py-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-3/4" />
              <Skeleton className="mt-3 h-3 w-1/2" />
            </div>
          ))}
        </div>
        <span className="sr-only">Haber başlıkları yükleniyor…</span>
      </div>
    </>
  );
}
