import Image from "next/image";
import { cn } from "@/lib/utils";
import { parseMediaUrl } from "@/lib/media/kinds";

/**
 * Photo box (object-cover). Our own stores (R2, Supabase media: next.config remotePatterns) go through next/image
 * resizing, so a 1600 px guide photo is not downloaded for a 56 px thumbnail; other hosts are shown as they are.
 */
export function GuidePhoto({
  src,
  alt,
  sizes,
  priority,
  className,
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative block overflow-hidden bg-muted", className)}>
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} unoptimized={!parseMediaUrl(src)} className="object-cover" />
    </span>
  );
}
