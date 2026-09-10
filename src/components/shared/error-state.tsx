"use client";

import { useRouter } from "next/navigation";
import { CloudOff, RotateCw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type ErrorStateProps = {
  title?: string;
  description?: string;
  /** Retry handler; default is router.refresh(). */
  onRetry?: () => void;
  retryLabel?: string;
  /** Show the offline icon/message. */
  offline?: boolean;
  compact?: boolean;
  className?: string;
};

/** Error with a retry button. Use in error.tsx boundaries and failed client fetches. */
export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = "Tekrar dene",
  offline,
  compact,
  className,
}: ErrorStateProps) {
  const router = useRouter();
  const Icon = offline ? CloudOff : TriangleAlert;
  return (
    <div role="alert" className={cn("flex flex-col items-center text-center", compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12", className)}>
      <div className={cn("flex items-center justify-center rounded-3xl bg-destructive/10 text-destructive", compact ? "size-14" : "size-20")}>
        <Icon className={compact ? "size-7" : "size-9"} strokeWidth={1.8} aria-hidden />
      </div>
      <h2 className={cn("font-bold", compact ? "text-base" : "text-xl")}>
        {title ?? (offline ? "İnternet bağlantısı yok" : "Bir şeyler ters gitti")}
      </h2>
      <p className="max-w-sm text-sm leading-relaxed text-balance text-muted-foreground">
        {description ?? (offline ? "Bağlantın geri geldiğinde tekrar dene." : "Bu içerik şu an yüklenemedi. Biraz sonra tekrar dene.")}
      </p>
      <Button variant="outline" className="mt-2" onClick={() => (onRetry ? onRetry() : router.refresh())}>
        <RotateCw />
        {retryLabel}
      </Button>
    </div>
  );
}
