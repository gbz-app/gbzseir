import Link from "next/link";
import { Plus } from "lucide-react";
import { routes } from "@/core/routes";

/** Floating "+ İlan Ver" button: above the bottom nav, safe-area aware, aligned to the app column. */
export function PostListingFab() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottomnav-h)+env(safe-area-inset-bottom,0px)+0.75rem)] z-30 mx-auto flex w-full max-w-2xl justify-end px-4">
      <Link
        href={routes.listings.post()}
        className="pointer-events-auto inline-flex h-12 items-center gap-2 rounded-full bg-primary pr-5 pl-4 text-[15px] font-bold text-primary-foreground shadow-card ring-1 ring-black/5 transition-transform outline-none active:scale-95 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Plus className="size-5" aria-hidden />
        İlan Ver
      </Link>
    </div>
  );
}
