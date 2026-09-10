"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type ShareButtonProps = {
  title: string;
  text?: string;
  /** Absolute or relative URL (default: current page). */
  url?: string;
  label?: string;
  iconOnly?: boolean;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
  className?: string;
};

/** Native share sheet (navigator.share) with a copy-link fallback. */
export function ShareButton({ title, text, url, label = "Paylaş", iconOnly, variant = "outline", size = "default", className }: ShareButtonProps) {
  const onClick = async () => {
    const href = new URL(url ?? window.location.href, window.location.origin).toString();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url: href });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(href);
      toast.success("Bağlantı kopyalandı");
    } catch {
      toast.message("Bağlantıyı kopyala", { description: href });
    }
  };
  return (
    <Button
      type="button"
      variant={iconOnly && variant === "outline" ? "ghost" : variant}
      size={iconOnly ? "icon" : size}
      className={cn(iconOnly && "rounded-full", className)}
      onClick={onClick}
      aria-label={iconOnly ? label : undefined}
    >
      <Share2 />
      {iconOnly ? null : label}
    </Button>
  );
}
