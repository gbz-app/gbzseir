import { ExternalLink, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { ECZACI_ODASI_NAME, ECZACI_ODASI_URL } from "../config";

/** Red band shown when there is no verified duty list for the current window. Server-safe. */
export function DutyUnverified({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div role="alert" className={cn("rounded-2xl border border-destructive/30 bg-destructive/10", compact ? "p-3" : "p-4", className)}>
      <p className="flex items-center gap-2 font-bold text-destructive">
        <TriangleAlert className="size-5 shrink-0" aria-hidden />
        Liste doğrulanamadı
      </p>
      <p className="mt-1 text-sm leading-relaxed text-foreground/80">
        Şu an için doğrulanmış bir nöbet listesi gösteremiyoruz. Güncel liste için {ECZACI_ODASI_NAME}&apos;nı kontrol edin.
      </p>
      <a
        href={ECZACI_ODASI_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-destructive px-4 text-sm font-semibold text-white outline-none hover:bg-destructive/90 focus-visible:ring-3 focus-visible:ring-destructive/40"
      >
        {ECZACI_ODASI_NAME}
        <ExternalLink className="size-4" aria-hidden />
      </a>
    </div>
  );
}
