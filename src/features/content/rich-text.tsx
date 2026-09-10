import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Tiny markup renderer for long Turkish texts (legal pages, FAQ answers). Server-safe.
 *
 * Blocks (separated by blank lines):  paragraph · "- " bullet list · "1. " numbered list · "### " sub-heading · "> " note
 * Inline:  **bold** · [label](/internal | https://external | tel:...) · [Placeholder] (highlighted, e.g. [Şirket Unvanı])
 */

type ListBlock = { type: "ul" | "ol"; items: string[] };
type Block = { type: "p" | "h3" | "note"; text: string } | ListBlock;

export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const state: { para: string[]; list: ListBlock | null } = { para: [], list: null };

  const flushPara = () => {
    if (state.para.length) blocks.push({ type: "p", text: state.para.join(" ") });
    state.para = [];
  };
  const flushList = () => {
    if (state.list) blocks.push(state.list);
    state.list = null;
  };

  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    if (line.startsWith("### ")) {
      flushPara();
      flushList();
      blocks.push({ type: "h3", text: line.slice(4) });
      continue;
    }
    if (line.startsWith("> ")) {
      flushPara();
      flushList();
      blocks.push({ type: "note", text: line.slice(2) });
      continue;
    }
    const ul = /^- (.*)$/.exec(line);
    const ol = /^\d+[.)] (.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const type = ul ? "ul" : "ol";
      if (!state.list || state.list.type !== type) {
        flushList();
        state.list = { type, items: [] };
      }
      state.list.items.push((ul ?? ol)![1]);
      continue;
    }
    flushList();
    state.para.push(line);
  }
  flushPara();
  flushList();
  return blocks;
}

const INLINE_SOURCE = String.raw`\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|\[([^\]]+)\]`;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = new RegExp(INLINE_SOURCE, "g");
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${i++}`;
    if (m[1] !== undefined) {
      out.push(
        <strong key={key} className="font-semibold text-foreground">
          {renderInline(m[1], key)}
        </strong>,
      );
    } else if (m[2] !== undefined) {
      const href = m[3];
      if (href.startsWith("/") || href.startsWith("#")) {
        out.push(
          <Link key={key} href={href}>
            {m[2]}
          </Link>,
        );
      } else if (href.startsWith("tel:") || href.startsWith("mailto:")) {
        out.push(
          <a key={key} href={href}>
            {m[2]}
          </a>,
        );
      } else {
        out.push(
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {m[2]}
            <span className="sr-only"> (yeni sekmede açılır)</span>
          </a>,
        );
      }
    } else {
      out.push(
        <mark key={key} className="rounded bg-highlight-soft px-1 font-semibold text-highlight-foreground dark:text-foreground">
          [{m[4]}]
        </mark>,
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ source, className }: { source: string; className?: string }) {
  const blocks = parseBlocks(source);
  return (
    <div
      className={cn(
        "flex flex-col gap-3 text-[15px] leading-relaxed text-foreground/90 [&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
        className,
      )}
    >
      {blocks.map((b, i) => {
        const k = `b${i}`;
        switch (b.type) {
          case "h3":
            return (
              <h3 key={k} className="mt-1 text-base font-bold text-foreground">
                {renderInline(b.text, k)}
              </h3>
            );
          case "note":
            return (
              <p key={k} className="rounded-xl bg-muted/70 px-3.5 py-2.5 text-sm text-muted-foreground">
                {renderInline(b.text, k)}
              </p>
            );
          case "ul":
          case "ol": {
            const Tag = b.type;
            return (
              <Tag key={k} className={cn("flex flex-col gap-1.5 pl-5 marker:text-muted-foreground", b.type === "ul" ? "list-disc" : "list-decimal")}>
                {b.items.map((item, j) => (
                  <li key={j} className="pl-0.5">
                    {renderInline(item, `${k}-${j}`)}
                  </li>
                ))}
              </Tag>
            );
          }
          default:
            return <p key={k}>{renderInline(b.text, k)}</p>;
        }
      })}
    </div>
  );
}

/** Plain text (for JSON-LD / meta descriptions). */
export function richTextToPlain(source: string): string {
  return parseBlocks(source)
    .map((b) => ("items" in b ? b.items.map((item) => `• ${item}`).join(" ") : b.text))
    .join(" ")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
