import { CITY } from "@/config/site";

/**
 * Home headline: one short line about Gebze (the name lives in the top bar). Never wraps: the size eases from 1.75rem
 * down to 1.375rem on narrow phones (about 304px of text in the 328px column at 360px wide).
 */
export function HomeHero() {
  return (
    <h1 className="pt-1 text-[clamp(1.375rem,7.2vw,1.75rem)] leading-tight font-bold tracking-tight whitespace-nowrap">
      {CITY.name}&apos;de aradığın her şey
    </h1>
  );
}
