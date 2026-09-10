import { Info, PhoneCall } from "lucide-react";
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
  className?: string;
};

/** "Kaynak · Son güncelleme · Gitmeden önce arayın" footer for any external data. Server-safe. */
export function DataSourceNote({ source, sourceUrl, updatedAt, callAhead, note, className }: DataSourceNoteProps) {
  return (
    <div className={cn("rounded-2xl bg-muted/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground", className)}>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <Info className="size-3.5 shrink-0" aria-hidden />
        <span>
          Kaynak:{" "}
          {sourceUrl ? (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-foreground underline underline-offset-2">
              {source}
            </a>
          ) : (
            <span className="font-semibold text-foreground">{source}</span>
          )}
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
      {callAhead ? (
        <p className="mt-1.5 flex items-center gap-1.5 font-semibold text-highlight-foreground dark:text-highlight">
          <PhoneCall className="size-3.5 shrink-0" aria-hidden />
          Gitmeden önce arayın.
        </p>
      ) : null}
      {note ? <p className="mt-1.5">{note}</p> : null}
    </div>
  );
}
