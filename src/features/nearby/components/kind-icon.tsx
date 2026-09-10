import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { KIND_META } from "../config";
import type { MarkerKind } from "../types";

export type KindIconProps = {
  kind: MarkerKind;
  /** Override the default icon of the kind (e.g. a place category icon). */
  icon?: LucideIcon;
  size?: "sm" | "md" | "lg";
  className?: string;
};

/** Rounded colored icon bubble for a poi kind (same colors as the map pins). Server-safe. */
export function KindIcon({ kind, icon, size = "md", className }: KindIconProps) {
  const meta = KIND_META[kind];
  const Icon = icon ?? meta.icon;
  const box = size === "lg" ? "size-14 rounded-2xl" : size === "sm" ? "size-10 rounded-xl" : "size-12 rounded-2xl";
  const ico = size === "lg" ? "size-7" : size === "sm" ? "size-5" : "size-6";
  return (
    <span className={cn("flex shrink-0 items-center justify-center", box, meta.tone, className)} aria-hidden>
      <Icon className={ico} />
    </span>
  );
}
