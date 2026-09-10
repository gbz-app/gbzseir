import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type SectionHeaderProps = {
  title: React.ReactNode;
  /** Optional line under the title. */
  description?: React.ReactNode;
  /** "Tümü" link target. */
  href?: string;
  /** Link text (default "Tümü"). */
  linkLabel?: string;
  /** Heading level (default h2). */
  as?: "h2" | "h3";
  /** Extra element on the right (instead of / next to the link). */
  action?: React.ReactNode;
  className?: string;
};

/** Section title with an optional "Tümü" link. Server-safe. */
export function SectionHeader({ title, description, href, linkLabel = "Tümü", as: Tag = "h2", action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <Tag className="text-lg leading-tight font-bold">{title}</Tag>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {action}
        {href ? (
          <Link
            href={href}
            className="-mr-2 inline-flex min-h-11 items-center gap-0.5 rounded-lg px-2 text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {linkLabel}
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
