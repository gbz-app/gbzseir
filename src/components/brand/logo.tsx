import { useId } from "react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/config/site";

/** Brand mark: a map pin with a stylized "G". Scales with className (e.g. "size-8"). */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 64 64" className={cn("shrink-0", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={`gz-pin-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14B8A6" />
          <stop offset="0.55" stopColor="#0F766E" />
          <stop offset="1" stopColor="#134E4A" />
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="60" rx="9" ry="2.2" fill="currentColor" opacity="0.12" />
      <path
        d="M32 4C20.4 4 11 13.2 11 24.6c0 14.9 17.5 32.1 19.6 34.1a2 2 0 0 0 2.8 0C35.5 56.7 53 39.5 53 24.6 53 13.2 43.6 4 32 4z"
        fill={`url(#gz-pin-${id})`}
      />
      <path d="M39.66 17.57A10 10 0 1 0 42 24H33.5" fill="none" stroke="#fff" strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="44.5" cy="12.5" r="3.2" fill="#F59E0B" />
    </svg>
  );
}

/** Mark + wordmark. */
export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-heading text-lg font-extrabold tracking-tight", className)}>
      <LogoMark className={cn("size-8", markClassName)} />
      <span>{APP_NAME}</span>
    </span>
  );
}
