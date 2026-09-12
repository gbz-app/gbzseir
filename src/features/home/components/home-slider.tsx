"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type HeroSlide = { key: string; href: string; image: string; kicker: string; title: string; sub?: string | null };

const AUTO_MS = 5000;

/**
 * Home slider under the search (350 px): full-bleed photos with the home page's 28 px corners, a white kicker chip,
 * the title and one line; swipe (snap) or wait 5 s for the next one (paused while touched, when the tab is hidden and
 * with reduced motion). Dots at the bottom. Slides come from our own content (events, places, news).
 */
export function HomeSlider({ slides }: { slides: HeroSlide[] }) {
  const ref = React.useRef<HTMLUListElement>(null);
  const paused = React.useRef(false);
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (slides.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      const el = ref.current;
      if (!el || paused.current || document.hidden || !el.clientWidth) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % slides.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [slides.length]);

  if (!slides.length) return null;

  const onScroll = () => {
    const el = ref.current;
    if (el?.clientWidth) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <section aria-roledescription="carousel" aria-label="Öne çıkanlar" className="relative">
      <ul
        ref={ref}
        onScroll={onScroll}
        onPointerDown={() => (paused.current = true)}
        onPointerUp={() => (paused.current = false)}
        onPointerCancel={() => (paused.current = false)}
        className="no-scrollbar flex h-[350px] snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-[1.75rem] bg-card"
      >
        {slides.map((s, i) => (
          <li key={s.key} aria-roledescription="slide" aria-label={`${i + 1} / ${slides.length}: ${s.title}`} className="relative h-full w-full shrink-0 snap-center">
            <Link href={s.href} className="absolute inset-0 block outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset">
              {/* Plain <img>: covers and photos may come from any https host (Storage, R2, Wikimedia). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.image}
                alt=""
                loading={i === 0 ? "eager" : "lazy"}
                fetchPriority={i === 0 ? "high" : undefined}
                decoding="async"
                className="absolute inset-0 size-full bg-muted object-cover"
              />
              <span className="absolute inset-0 bg-linear-to-t from-black/75 via-black/15 to-transparent" aria-hidden />
              <span className="absolute inset-x-0 bottom-0 p-5 pb-10 text-white">
                <span className="inline-flex h-7 items-center rounded-full bg-white/95 px-3 text-xs font-semibold text-neutral-900">{s.kicker}</span>
                <span className="mt-2.5 line-clamp-2 block text-[1.625rem] leading-tight font-bold tracking-tight text-balance">{s.title}</span>
                {s.sub ? <span className="mt-1 block truncate text-[15px] text-white/85">{s.sub}</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {slides.length > 1 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center gap-1.5" aria-hidden>
          {slides.map((s, i) => (
            <span key={s.key} className={cn("h-1.5 rounded-full bg-white/55 transition-all", i === index ? "w-5 bg-white" : "w-1.5")} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
