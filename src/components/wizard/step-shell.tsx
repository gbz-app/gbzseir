"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepShellProps = {
  title: React.ReactNode;
  help?: React.ReactNode;
  /** Optional step icon, shown in a soft purple chip next to the title. */
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  /** Focus the title when mounted (screen readers announce the new step). Default true. */
  focusTitle?: boolean;
};

/** Layout of one wizard step: (icon chip +) big title, help text, content. */
export function StepShell({ title, help, icon, children, className, focusTitle = true }: StepShellProps) {
  const ref = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    if (focusTitle) ref.current?.focus({ preventScroll: true });
  }, [focusTitle]);
  const heading = (
    <h2 ref={ref} tabIndex={-1} className="min-w-0 text-[1.6rem] leading-tight font-extrabold text-balance break-words outline-none">
      {title}
    </h2>
  );
  return (
    <section className={cn("animate-fade-in", className)}>
      {icon ? (
        <div className="flex items-center gap-3">
          <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-primary">
            {React.createElement(icon, { className: "size-[22px]", strokeWidth: 2 })}
          </span>
          {heading}
        </div>
      ) : (
        heading
      )}
      {help ? <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{help}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}
