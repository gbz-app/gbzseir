"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type OlBlock = { kind: "ol"; items: string[]; nums: number[]; raw: string[] };
type Block = { kind: "p"; lines: string[] } | { kind: "ul"; items: string[] } | OlBlock;

/** "- madde", "* madde", "• madde", "✓ madde"... ("-" and "*" need a space so "-5 derece" stays text). */
const BULLET_RE = /^\s*(?:[-*–—]\s+|[•·▪►✓✔]\s*)(\S.*)$/u;
/** "1. madde" / "1) madde" (a lone numbered line stays a paragraph: "2. vardiya..."). The author's number is kept. */
const NUMBER_RE = /^\s*(\d{1,2})[.)]\s+(\S.*)$/;

/** Plain ad text -> paragraphs and bullet / numbered lists. Single line breaks inside a paragraph are kept. */
export function parseJobText(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { kind: "ul"; items: string[] } | OlBlock | null = null;

  const pushList = (l: NonNullable<typeof list>) => {
    if (l.kind === "ol" && l.items.length < 2) blocks.push({ kind: "p", lines: l.raw });
    else blocks.push(l);
  };

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      if (para.length) blocks.push({ kind: "p", lines: para });
      para = [];
      if (list) pushList(list);
      list = null;
      continue;
    }
    const bullet = BULLET_RE.exec(raw);
    const numbered = bullet ? null : NUMBER_RE.exec(raw);
    if (bullet || numbered) {
      if (para.length) blocks.push({ kind: "p", lines: para });
      para = [];
      const kind = bullet ? "ul" : "ol";
      if (!list || list.kind !== kind) {
        if (list) pushList(list);
        list = kind === "ul" ? { kind: "ul", items: [] } : { kind: "ol", items: [], nums: [], raw: [] };
      }
      list.items.push((bullet ? bullet[1] : numbered![2]).trim());
      if (list.kind === "ol") {
        list.nums.push(Number(numbered![1]));
        list.raw.push(line);
      }
      continue;
    }
    if (list) pushList(list);
    list = null;
    para.push(line);
  }
  if (para.length) blocks.push({ kind: "p", lines: para });
  if (list) pushList(list);
  return blocks;
}

/** A short single line ending with ":" ("Görevler:") reads as a small heading. */
function isHeading(b: Block): boolean {
  return b.kind === "p" && b.lines.length === 1 && b.lines[0].length <= 60 && b.lines[0].endsWith(":");
}

/** Long texts start collapsed (~9 lines). Decided from the text so the server HTML already matches. */
const LONG_CHARS = 600;
const LONG_LINES = 10;

/**
 * Job ad text with comfortable typography (paragraphs, bullet / numbered lists) and a "Devamını oku"
 * collapse for long texts. The full text is always in the HTML (only clipped visually).
 */
export function JobRichText({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const trimmed = text.trim();
  const blocks = React.useMemo(() => parseJobText(trimmed), [trimmed]);
  if (!trimmed) return null;
  const lineCount = trimmed.split(/\n/).filter((l) => l.trim()).length;
  const long = trimmed.length > LONG_CHARS || lineCount > LONG_LINES;
  const collapsed = long && !open;

  return (
    <div className={className}>
      <div id={id} className={cn("relative", collapsed && "max-h-64 overflow-hidden")}>
        <div className="flex flex-col gap-3 text-[15px] leading-7 break-words text-foreground/90">
          {blocks.map((b, i) =>
            b.kind === "p" ? (
              <p key={i} className={cn("whitespace-pre-line", isHeading(b) && "-mb-1 font-semibold text-foreground")}>
                {b.lines.join("\n")}
              </p>
            ) : b.kind === "ul" ? (
              <ul key={i} className="flex flex-col gap-1.5">
                {b.items.map((item, j) => (
                  <li key={j} className="relative pl-5">
                    <span aria-hidden className="absolute top-[0.72rem] left-1 size-1.5 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <ol key={i} className="flex flex-col gap-2">
                {b.items.map((item, j) => (
                  <li key={j} className="flex gap-2.5">
                    <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-primary tabular-nums">
                      {b.nums[j]}
                    </span>
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
              </ol>
            ),
          )}
        </div>
        {collapsed ? <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-background to-transparent" /> : null}
      </div>
      {long ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="-ml-1 mt-1 inline-flex h-11 items-center gap-1 rounded-full px-1 text-[15px] font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {open ? "Daha az göster" : "Devamını oku"}
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
