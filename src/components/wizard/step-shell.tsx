"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type StepShellProps = {
  title: React.ReactNode;
  help?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Focus the title when mounted (screen readers announce the new step). Default true. */
  focusTitle?: boolean;
};

/** Layout of one wizard step: big title, help text, content. */
export function StepShell({ title, help, children, className, focusTitle = true }: StepShellProps) {
  const ref = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    if (focusTitle) ref.current?.focus({ preventScroll: true });
  }, [focusTitle]);
  return (
    <section className={cn("animate-fade-in", className)}>
      <h2 ref={ref} tabIndex={-1} className="text-[1.6rem] leading-tight font-extrabold text-balance outline-none">
        {title}
      </h2>
      {help ? <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{help}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}
