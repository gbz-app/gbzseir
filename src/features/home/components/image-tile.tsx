import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Square picture card with the title underneath (Yakınımda / Şehir Rehberi / Kategoriler on the home page). Shows
 * `image` when given, otherwise a large icon on the `tone` colour. `size="sm"` (the Şehir Rehberi strip, tiles 15%
 * smaller than the categories): smaller icon and a title of up to two lines. Width comes from the parent or `className`.
 * Server-safe.
 */
export function ImageTile({
  href,
  label,
  sub,
  image,
  icon: Icon,
  tone,
  sizes = "8rem",
  size = "md",
  className,
  imageClassName,
}: {
  href: string;
  label: string;
  sub?: string;
  image?: string;
  icon?: LucideIcon;
  tone?: string;
  sizes?: string;
  size?: "md" | "sm";
  className?: string;
  imageClassName?: string;
}) {
  const small = size === "sm";
  return (
    <Link href={href} className={cn("group block outline-none", className)}>
      <span
        className={cn(
          "relative flex aspect-square items-center justify-center overflow-hidden rounded-3xl transition-transform group-active:scale-[0.97] group-focus-visible:ring-3 group-focus-visible:ring-ring/50",
          image ? "bg-muted" : tone,
          imageClassName,
        )}
      >
        {image ? (
          <Image src={image} alt="" fill sizes={sizes} className="object-cover" />
        ) : Icon ? (
          <Icon className={small ? "size-8" : "size-10"} strokeWidth={1.5} aria-hidden />
        ) : null}
      </span>
      {small ? (
        <span className="mt-1.5 line-clamp-2 px-0.5 text-center text-xs leading-tight font-semibold">{label}</span>
      ) : (
        <span className="mt-2 block truncate px-0.5 text-center text-[13px] leading-tight font-semibold">{label}</span>
      )}
      {sub ? <span className="mt-0.5 block truncate px-0.5 text-center text-xs text-muted-foreground">{sub}</span> : null}
    </Link>
  );
}
