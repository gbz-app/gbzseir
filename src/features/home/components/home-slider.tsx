"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const SLIDES = 3;
const INTERVAL_MS = 10_000;

/**
 * Home banner slider: 3 slides (empty white for now, banners come later) that glide to the next one every 10 s.
 * Swipeable (scroll snap); auto-advance pauses for one interval after the user touches it and is off with reduced motion.
 */
export function HomeSlider() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(0);
  const pausedUntil = React.useRef(0);

  const goTo = React.useCallback((i: number, smooth = true) => {
    const el = ref.current;
    if (!el) return;
    const slide = el.children[i] as HTMLElement | undefined;
    if (slide) el.scrollTo({ left: slide.offsetLeft - el.offsetLeft, behavior: smooth ? "smooth" : "auto" });
  }, []);

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      if (Date.now() < pausedUntil.current || document.visibilityState !== "visible") return;
      const el = ref.current;
      if (!el) return;
      const current = Math.round(el.scrollLeft / el.clientWidth);
      goTo((current + 1) % SLIDES);
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [goTo]);

  const pause = () => {
    pausedUntil.current = Date.now() + INTERVAL_MS;
  };

  return (
    <section aria-roledescription="carousel" aria-label="Öne çıkanlar">
      <div
        ref={ref}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        onPointerDown={pause}
        onTouchStart={pause}
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth"
      >
        {Array.from({ length: SLIDES }, (_, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} / ${SLIDES}`}
            className="aspect-[2/1] w-full shrink-0 snap-center rounded-3xl bg-card"
          />
        ))}
      </div>
      <div className="mt-2.5 flex justify-center gap-1.5">
        {Array.from({ length: SLIDES }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${i + 1}. slayta git`}
            aria-current={i === index ? "true" : undefined}
            onClick={() => {
              pause();
              goTo(i);
            }}
            className={cn("h-1.5 rounded-full transition-all duration-500", i === index ? "w-5 bg-foreground/70" : "w-1.5 bg-foreground/20")}
          />
        ))}
      </div>
    </section>
  );
}
