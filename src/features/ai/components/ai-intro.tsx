import { CalendarDays, CarTaxiFront, Coffee, Pill, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/** Sparkles composition: a big sparkle tile with four small topic bubbles around it. Decorative. */
export function AiIntroArt({ className }: { className?: string }) {
  const bubble = "absolute flex size-10 items-center justify-center rounded-full bg-card text-primary";
  return (
    <div className={cn("relative mx-auto size-40", className)} aria-hidden>
      <div className="absolute inset-6 flex items-center justify-center rounded-[2rem] bg-card">
        <div className="flex size-20 items-center justify-center rounded-3xl bg-brand-soft">
          <Sparkles className="size-10 text-primary" strokeWidth={1.7} />
        </div>
      </div>
      <span className={cn(bubble, "top-0 left-1")}>
        <Pill className="size-5" strokeWidth={1.9} />
      </span>
      <span className={cn(bubble, "top-2 right-0")}>
        <Coffee className="size-5" strokeWidth={1.9} />
      </span>
      <span className={cn(bubble, "bottom-1 left-0")}>
        <CalendarDays className="size-5" strokeWidth={1.9} />
      </span>
      <span className={cn(bubble, "right-1 bottom-0")}>
        <CarTaxiFront className="size-5" strokeWidth={1.9} />
      </span>
    </div>
  );
}

/** Small avatar next to assistant messages. */
export function AiAvatar({ className }: { className?: string }) {
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-primary", className)} aria-hidden>
      <Sparkles className="size-4" strokeWidth={2} />
    </span>
  );
}
