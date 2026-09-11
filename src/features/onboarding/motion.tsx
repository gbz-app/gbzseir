/**
 * Onboarding motion vocabulary (pure CSS, ob-* animations in globals.css).
 *
 * Every slide is a `group/s` section with two data attributes set by the gate:
 *  - data-enter="1": the slide was reached by a tap, a key or a progress segment, so its parts play their entrance
 *    (a slide pulled in by swiping is already on screen and stays still);
 *  - data-on="true": the slide is the current one, so idle loops (float, pulse, orbit…) run; elsewhere they pause.
 * Everything is `motion-safe`: with prefers-reduced-motion the art simply renders in its final, still state.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export type Enter = "rise" | "content" | "pop" | "drop" | "slide" | "fan" | "fade";
export type Idle = "float" | "breathe" | "sway" | "ring" | "twinkle" | "ping" | "orbit" | "orbitRev" | "march";

export const ENTER: Record<Enter, string> = {
  rise: "motion-safe:group-data-[enter=1]/s:animate-ob-rise",
  content: "motion-safe:group-data-[enter=1]/s:animate-ob-content",
  pop: "motion-safe:group-data-[enter=1]/s:animate-ob-pop",
  drop: "motion-safe:group-data-[enter=1]/s:animate-ob-drop",
  slide: "motion-safe:group-data-[enter=1]/s:animate-ob-slide",
  fan: "motion-safe:group-data-[enter=1]/s:animate-ob-fan",
  fade: "motion-safe:group-data-[enter=1]/s:animate-ob-fade",
};

/** Idle loops pause (keeping their pose) while the slide is not the current one. */
const PAUSE = "group-data-[on=false]/s:[animation-play-state:paused]";

export const IDLE: Record<Idle, string> = {
  float: `motion-safe:animate-ob-float ${PAUSE}`,
  breathe: `motion-safe:animate-ob-breathe ${PAUSE}`,
  sway: `motion-safe:animate-ob-sway ${PAUSE}`,
  ring: `motion-safe:animate-ob-ring ${PAUSE}`,
  twinkle: `motion-safe:animate-ob-twinkle ${PAUSE}`,
  ping: `opacity-0 motion-safe:animate-ob-ping ${PAUSE}`,
  orbit: `motion-safe:animate-ob-orbit ${PAUSE}`,
  orbitRev: `motion-safe:animate-ob-orbit-rev ${PAUSE}`,
  march: `motion-safe:animate-ob-march ${PAUSE}`,
};

/** className + style for an element that plays an entrance after `d` ms. */
export function enter(kind: Enter, d = 0): { className: string; style: React.CSSProperties } {
  return { className: ENTER[kind], style: { "--ob-d": `${d}ms` } as React.CSSProperties };
}

type MProps = {
  enter?: Enter;
  idle?: Idle;
  /** Entrance delay (ms). */
  d?: number;
  /** Idle delay (ms); defaults to shortly after the entrance. */
  i?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

/**
 * A motion layer. Entrance and idle both animate `transform`, so when both are given they go on nested elements
 * (className and style on the outer one).
 */
export function M({ enter: kind, idle, d = 0, i, className, style, children }: MProps) {
  const vars = { "--ob-d": `${d}ms`, "--ob-i": `${i ?? d + 700}ms`, ...style } as React.CSSProperties;
  if (kind && idle) {
    return (
      <div className={cn(ENTER[kind], className)} style={vars}>
        <div className={cn("size-full", IDLE[idle])}>{children}</div>
      </div>
    );
  }
  return (
    <div className={cn(kind && ENTER[kind], idle && IDLE[idle], className)} style={vars}>
      {children}
    </div>
  );
}
