import { Database, Info, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/core/format";
import type { DateInput } from "@/core/time";

export type DataSourceNoteProps = {
  /** Data source name, e.g. "Kocaeli Eczacı Odası". */
  source: string;
  sourceUrl?: string;
  /** Last successful update of the data. */
  updatedAt?: DateInput | null;
  /** Show the "Gitmeden önce arayın" warning (pharmacies, opening hours). */
  callAhead?: boolean;
  /** Extra note line. */
  note?: React.ReactNode;
  /** "note" (default): the small grey footer; "card": a white card with a "Kaynak" row (detail pages). */
  variant?: "note" | "card";
  className?: string;
};

function SourceName({ source, sourceUrl }: { source: string; sourceUrl?: string }) {
  return sourceUrl ? (
    <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground underline underline-offset-2">
      {source}
    </a>
  ) : (
    <span className="font-semibold text-foreground">{source}</span>
  );
}

function CallAhead({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-center gap-1.5 font-semibold text-highlight-foreground dark:text-highlight", className)}>
      <PhoneCall className="size-3.5 shrink-0" aria-hidden />
      Gitmeden önce arayın.
    </p>
  );
}

/** "Kaynak · Son güncelleme · Gitmeden önce arayın" for any external data, as a small note or a card. Server-safe. */
export function DataSourceNote({ source, sourceUrl, updatedAt, callAhead, note, variant = "note", className }: DataSourceNoteProps) {
  if (variant === "card") {
    return (
      <section aria-label="Kaynak" className={cn("rounded-[1.75rem] bg-card p-4", className)}>
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden>
            <Database className="size-4" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1 leading-snug">
            <p className="text-[11px] font-medium text-muted-foreground">Kaynak</p>
            <p className="mt-0.5 text-[13px] break-words">
              <SourceName source={source} sourceUrl={sourceUrl} />
            </p>
          </div>
        </div>
        {updatedAt || callAhead || note ? (
          <div className="mt-3 flex flex-col gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            {updatedAt ? (
              <p>
                Son güncelleme: <span className="font-semibold text-foreground">{formatDateTime(updatedAt)}</span>
              </p>
            ) : null}
            {callAhead ? <CallAhead /> : null}
            {note ? <p>{note}</p> : null}
          </div>
        ) : null}
      </section>
    );
  }
  return (
    <div className={cn("rounded-2xl bg-muted/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground", className)}>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <Info className="size-3.5 shrink-0" aria-hidden />
        <span>
          Kaynak: <SourceName source={source} sourceUrl={sourceUrl} />
        </span>
        {updatedAt ? (
          <>
            <span aria-hidden>·</span>
            <span>
              Son güncelleme: <span className="font-semibold text-foreground">{formatDateTime(updatedAt)}</span>
            </span>
          </>
        ) : null}
      </p>
      {callAhead ? <CallAhead className="mt-1.5" /> : null}
      {note ? <p className="mt-1.5">{note}</p> : null}
    </div>
  );
}
