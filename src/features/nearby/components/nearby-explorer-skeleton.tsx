import { Skeleton } from "@/components/ui/skeleton";
import { MapPin } from "lucide-react";

/** Height of the /yakinimda map area: viewport minus the bottom nav and safe areas (no top bar; vh fallback for old browsers). */
export const NEARBY_AREA_CLASS =
  "relative w-full min-h-[420px] overflow-hidden h-[calc(100vh_-_var(--bottomnav-h))] supports-[height:100dvh]:h-[calc(100dvh_-_var(--bottomnav-h)_-_env(safe-area-inset-top,0px)_-_env(safe-area-inset-bottom,0px))]";

/** Loading state of /yakinimda: chips, map placeholder and the list sheet. Server-safe. */
export function NearbyExplorerSkeleton() {
  return (
    <div className={NEARBY_AREA_CLASS} role="status" aria-label="Yükleniyor">
      <div className="absolute inset-0 flex items-center justify-center bg-[#efe9e1] dark:bg-[#1f2826]">
        <MapPin className="size-8 text-muted-foreground/50" aria-hidden />
      </div>
      <div className="absolute inset-x-0 top-0 flex gap-2 overflow-hidden px-4 pt-3.5">
        {[72, 64, 56, 60, 84, 88].map((w, i) => (
          <Skeleton key={i} className="h-10 shrink-0 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[55%] rounded-t-3xl bg-background px-4 pt-3 shadow-[0_-10px_30px_-12px_rgb(0_0_0/0.25)]">
        <Skeleton className="mx-auto h-1.5 w-11 rounded-full" />
        <Skeleton className="mt-4 h-5 w-1/2" />
        <Skeleton className="mt-2 h-3 w-1/3" />
        <div className="mt-4 flex flex-col gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-[1.75rem] bg-card p-4">
              <div className="flex gap-3">
                <Skeleton className="size-10 rounded-xl" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="mt-2 h-3 w-1/2" />
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Skeleton className="h-11 flex-1 rounded-xl" />
                <Skeleton className="h-11 flex-1 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Yükleniyor…</span>
    </div>
  );
}
