import { Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { posterSrc, type PosterWidth } from "../lib/format";

/** 2:3 poster from the operator's CDN (hotlinked, not copied); purple placeholder when there is none. Server-safe. */
export function FilmPoster({ url, width, eager, className }: { url: string | null; width: PosterWidth; eager?: boolean; className?: string }) {
  const src = posterSrc(url, width);
  return (
    <span className={cn("relative block aspect-[2/3] w-full overflow-hidden rounded-2xl bg-muted", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- source CDN poster, outside the next/image remotePatterns
        <img
          src={src}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-violet-200 via-brand-soft to-fuchsia-100 dark:from-violet-500/25 dark:via-brand-soft dark:to-fuchsia-500/15">
          <Clapperboard className="size-10 text-primary/45" strokeWidth={1.5} aria-hidden />
        </span>
      )}
    </span>
  );
}
