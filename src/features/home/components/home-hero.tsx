import { CITY } from "@/config/site";

/** Left-aligned headline of the home page (the greeting lives in the top bar). */
export function HomeHero() {
  return (
    <h1 className="text-[1.75rem] leading-[1.15] font-bold tracking-tight text-balance">
      {CITY.province}&apos;yi keşfet, aradığını hemen bul
    </h1>
  );
}
