import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/** Small avatar next to assistant messages. */
export function AiAvatar({ className }: { className?: string }) {
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-primary", className)} aria-hidden>
      <Sparkles className="size-4" strokeWidth={2} />
    </span>
  );
}
