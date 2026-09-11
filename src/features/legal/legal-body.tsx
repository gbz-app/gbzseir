import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { parseLegalBody } from "./meta";

const PLACEHOLDER_RE = /\[[^\]\n]+\]/g;

/** Bracketed fields still to be filled in ([Şirket unvanı], [Hukuki inceleme: ...]) are highlighted. */
function withPlaceholders(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <mark key={m.index} className="rounded bg-highlight-soft px-1 font-semibold text-highlight-foreground dark:text-foreground">
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A legal text body (see parseLegalBody). Server-safe; the admin editor uses it for the preview. */
export function LegalBody({ body, className }: { body: string; className?: string }) {
  const blocks = parseLegalBody(body);
  return (
    <div className={cn("flex flex-col gap-3 text-[15px] leading-relaxed break-words text-foreground/90", className)}>
      {blocks.map((b, i) =>
        b.type === "heading" ? (
          <h2 key={i} className="mt-3 text-base leading-snug font-bold text-foreground first:mt-0">
            {withPlaceholders(b.text)}
          </h2>
        ) : b.type === "list" ? (
          <ul key={i} className="flex list-disc flex-col gap-1.5 pl-5 marker:text-primary">
            {b.items.map((item, j) => (
              <li key={j}>{withPlaceholders(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-line">
            {withPlaceholders(b.text)}
          </p>
        ),
      )}
    </div>
  );
}
