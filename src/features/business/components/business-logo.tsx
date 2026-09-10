import { Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/core/format";

const SIZES = {
  sm: "size-10 rounded-xl text-sm",
  md: "size-14 rounded-2xl text-lg",
  lg: "size-20 rounded-3xl text-2xl",
  xl: "size-24 rounded-3xl text-3xl",
} as const;

export type BusinessLogoProps = {
  name: string;
  url?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
};

/** Square business logo with an initials fallback. Server-safe. */
export function BusinessLogo({ name, url, size = "md", className }: BusinessLogoProps) {
  const base = cn("relative flex shrink-0 items-center justify-center overflow-hidden ring-1 ring-foreground/[0.06]", SIZES[size], className);
  if (url) {
    return (
      <span className={cn(base, "bg-card")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      </span>
    );
  }
  const text = initials(name);
  return (
    <span className={cn(base, "bg-brand-soft font-extrabold text-primary")} aria-hidden>
      {text === "?" ? <Store className="size-1/2" /> : text}
    </span>
  );
}
