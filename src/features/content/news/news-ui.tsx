import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { RelativeTime } from "@/components/shared/relative-time";
import { NEWS_CATEGORY_LABELS, type NewsCategory, type NewsItem } from "./parse";

// Presentational news pieces (no hooks): used by the client feed and by the server home widget.

const SOURCE_TONES = [
  "bg-brand-soft text-primary",
  "bg-highlight-soft text-highlight-foreground dark:text-highlight",
  "bg-info-soft text-info",
  "bg-success-soft text-success",
  "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
];

function toneFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SOURCE_TONES[h % SOURCE_TONES.length];
}

/** Letter badge for a news source (no logos or images are loaded from sources). */
export function SourceMark({ name, className }: { name: string; className?: string }) {
  const letter = name.trim().charAt(0).toLocaleUpperCase("tr-TR") || "?";
  return (
    <span aria-hidden className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-extrabold", toneFor(name), className)}>
      {letter}
    </span>
  );
}

/** "Kaynak · 5 dk önce" */
export function NewsMeta({ item, className }: { item: NewsItem; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <SourceMark name={item.sourceName} />
      <span className="truncate font-semibold text-foreground/80">{item.sourceName}</span>
      {item.publishedAt ? (
        <>
          <span aria-hidden>·</span>
          <RelativeTime date={item.publishedAt} className="shrink-0" />
        </>
      ) : null}
    </span>
  );
}

export function CategoryTag({ category, className }: { category: NewsCategory; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full bg-muted px-2.5 text-xs font-semibold text-muted-foreground", className)}>
      {NEWS_CATEGORY_LABELS[category]}
    </span>
  );
}

const externalHint = <span className="sr-only"> (kaynak sitede, yeni sekmede açılır)</span>;

/** Big first card ("Manşet"): title, summary, source and a clear "Kaynağa git" call to action. */
export function HeadlineCard({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-3xl bg-card p-5 shadow-card ring-1 ring-foreground/[0.06] outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-6 items-center rounded-full bg-primary px-2.5 text-xs font-bold text-primary-foreground">Manşet</span>
        <CategoryTag category={item.category} />
      </div>
      <h2 className="mt-3 text-xl leading-snug font-extrabold text-balance decoration-2 underline-offset-4 group-hover:underline">{item.title}</h2>
      {item.summary ? <p className="mt-2 line-clamp-5 text-[15px] leading-relaxed text-muted-foreground">{item.summary}</p> : null}
      <div className="mt-4 flex items-center justify-between gap-3">
        <NewsMeta item={item} />
        <span className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-colors group-hover:bg-primary/90">
          Kaynağa git
          <ExternalLink className="size-4" aria-hidden />
          {externalHint}
        </span>
      </div>
    </a>
  );
}

/** List row: optional category eyebrow, title, 2-line summary, source + time and "Kaynağa git". */
export function NewsRow({ item, showCategory = true, compact }: { item: NewsItem; showCategory?: boolean; compact?: boolean }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-1.5 py-3.5 outline-none focus-visible:rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {showCategory && item.category !== "gundem" ? (
        <span className="text-[11px] font-bold tracking-wide text-primary uppercase">{NEWS_CATEGORY_LABELS[item.category]}</span>
      ) : null}
      <h3 className={cn("text-[15px] leading-snug font-bold underline-offset-2 group-hover:underline", compact ? "line-clamp-2" : "line-clamp-3")}>{item.title}</h3>
      {item.summary && !compact ? <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{item.summary}</p> : null}
      <div className="mt-0.5 flex items-center gap-3">
        <NewsMeta item={item} className="flex-1" />
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
          Kaynağa git
          <ExternalLink className="size-3.5" aria-hidden />
          {externalHint}
        </span>
      </div>
    </a>
  );
}
