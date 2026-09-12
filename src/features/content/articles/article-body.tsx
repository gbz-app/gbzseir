import Link from "next/link";
import type { ReactNode } from "react";
import { Quote } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Body of our own news story (news_articles.body, plain text written in the admin). Server-safe, no HTML is ever
 * injected: every block becomes a React element.
 *
 * Blocks (blank lines separate paragraphs; a single line break stays inside the paragraph):
 *   "## " / "### " heading · "- " or "* " bullet list · "1. " numbered list · "> " quote
 *   "![Açıklama](https://...)" alone on a line: image with an optional caption
 * Inline: **bold** · [label](https://... | /internal | tel: | mailto:)
 * A story written as plain paragraphs renders exactly as paragraphs.
 */

type Block =
  | { type: "p"; lines: string[] }
  | { type: "h2" | "h3"; text: string }
  | { type: "quote"; lines: string[] }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "img"; src: string; caption: string };

const IMAGE_RE = /^!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)$/;

function hostOf(url: string | undefined): string | null {
  try {
    return url ? new URL(url).host : null;
  } catch {
    return null;
  }
}

/** Hosts in next.config's img-src: the Supabase project, the R2 public bucket (NEXT_PUBLIC_MEDIA_BASE_URL) and *.r2.dev. */
const OWN_IMAGE_HOSTS = new Set([hostOf(process.env.NEXT_PUBLIC_SUPABASE_URL), hostOf(process.env.NEXT_PUBLIC_MEDIA_BASE_URL)].filter((h): h is string => !!h));

function isOwnImageHost(src: string): boolean {
  const host = hostOf(src);
  return !!host && (OWN_IMAGE_HOSTS.has(host) || host.endsWith(".r2.dev"));
}
const UL_RE = /^[-*•] (.*)$/;
const OL_RE = /^\d+[.)] (.*)$/;

function parseArticle(source: string): Block[] {
  const blocks: Block[] = [];
  let open: Block | null = null;
  const close = () => {
    if (open) blocks.push(open);
    open = null;
  };

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      close();
      continue;
    }
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) {
      close();
      blocks.push({ type: heading[1].length === 3 ? "h3" : "h2", text: heading[2] });
      continue;
    }
    const image = IMAGE_RE.exec(line);
    if (image) {
      close();
      // Only our own stores: other hosts are outside the img-src CSP and hotlinking third-party photos is a licence risk.
      if (isOwnImageHost(image[2])) blocks.push({ type: "img", src: image[2], caption: image[1].trim() });
      continue;
    }
    if (line.startsWith(">")) {
      const text = line.replace(/^>\s?/, "");
      if (open?.type !== "quote") {
        close();
        open = { type: "quote", lines: [] };
      }
      if (text) open.lines.push(text);
      continue;
    }
    const ul = UL_RE.exec(line);
    const ol = ul ? null : OL_RE.exec(line);
    if (ul || ol) {
      const type = ul ? "ul" : "ol";
      if (open?.type !== type) {
        close();
        open = { type, items: [] };
      }
      open.items.push((ul ?? ol)![1]);
      continue;
    }
    if (open?.type !== "p") {
      close();
      open = { type: "p", lines: [] };
    }
    open.lines.push(line);
  }
  close();
  return blocks;
}

const INLINE_RE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

function safeHref(href: string): { href: string; kind: "internal" | "external" | "plain" } | null {
  // "//host" and "/\host" are protocol-relative in browsers: never internal.
  if (/^\/(?![/\\])/.test(href)) return { href, kind: "internal" };
  if (href.startsWith("tel:") || href.startsWith("mailto:")) return { href, kind: "plain" };
  if (/^https?:\/\//i.test(href)) return { href, kind: "external" };
  return null;
}

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = new RegExp(INLINE_RE.source, "g");
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1] !== undefined) {
      out.push(
        <strong key={k} className="font-semibold text-foreground">
          {inline(m[1], k)}
        </strong>,
      );
    } else {
      const link = safeHref(m[3]);
      if (!link) out.push(m[2]);
      else if (link.kind === "internal")
        out.push(
          <Link key={k} href={link.href}>
            {m[2]}
          </Link>,
        );
      else if (link.kind === "plain")
        out.push(
          <a key={k} href={link.href}>
            {m[2]}
          </a>,
        );
      else
        out.push(
          <a key={k} href={link.href} target="_blank" rel="noopener noreferrer">
            {m[2]}
            <span className="sr-only"> (yeni sekmede açılır)</span>
          </a>,
        );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Lines of one paragraph with their line breaks kept. */
function lines(list: string[], key: string): ReactNode[] {
  return list.flatMap((l, i) => (i ? [<br key={`${key}-br${i}`} />, ...inline(l, `${key}-${i}`)] : inline(l, `${key}-${i}`)));
}

/** Reading column: 17px text, relaxed leading, headings, lists, quotes and captioned images. No borders or shadows. */
export function ArticleBody({ body, className }: { body: string; className?: string }) {
  const blocks = parseArticle(body);
  if (!blocks.length) return null;
  return (
    <div
      className={cn(
        "flex flex-col gap-5 text-[17px] leading-[1.75] text-foreground/90 [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:decoration-primary/40 [&_a]:underline-offset-4 [&_a:hover]:decoration-primary",
        className,
      )}
    >
      {blocks.map((b, i) => {
        const k = `b${i}`;
        switch (b.type) {
          case "h2":
            return (
              <h2 key={k} className="mt-3 text-[1.3rem] leading-snug font-semibold tracking-tight text-balance text-foreground">
                {inline(b.text, k)}
              </h2>
            );
          case "h3":
            return (
              <h3 key={k} className="mt-2 text-lg leading-snug font-semibold text-foreground">
                {inline(b.text, k)}
              </h3>
            );
          case "quote":
            return (
              <blockquote key={k} className="my-1 rounded-3xl bg-brand-soft px-5 py-4 text-foreground">
                <Quote className="mb-2 size-5 text-primary" aria-hidden />
                <p className="text-lg leading-relaxed font-medium">{lines(b.lines, k)}</p>
              </blockquote>
            );
          case "ul":
          case "ol": {
            const Tag = b.type;
            return (
              <Tag key={k} className={cn("flex flex-col gap-2 pl-6 marker:text-primary", b.type === "ul" ? "list-disc" : "list-decimal marker:font-semibold")}>
                {b.items.map((item, j) => (
                  <li key={j} className="pl-1">
                    {inline(item, `${k}-${j}`)}
                  </li>
                ))}
              </Tag>
            );
          }
          case "img":
            return (
              <figure key={k} className="my-1">
                {/* Plain <img>: an editor may link any https host (next/image would reject it). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.src} alt={b.caption} loading="lazy" decoding="async" className="w-full bg-muted object-cover" />
                {b.caption ? <figcaption className="mt-2 px-1 text-sm leading-relaxed text-muted-foreground">{b.caption}</figcaption> : null}
              </figure>
            );
          default:
            return <p key={k}>{lines(b.lines, k)}</p>;
        }
      })}
    </div>
  );
}

/** Plain text of a body (meta descriptions): markup removed, whitespace collapsed. */
export function articlePlainText(body: string): string {
  const text = (b: Block): string => {
    switch (b.type) {
      case "ul":
      case "ol":
        return b.items.join(" ");
      case "img":
        return b.caption;
      case "h2":
      case "h3":
        return b.text;
      default:
        return b.lines.join(" ");
    }
  };
  return parseArticle(body)
    .map(text)
    .join(" ")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
