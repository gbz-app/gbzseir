import { CITY } from "@/config/site";

/** Left-aligned headline of the home page (the greeting lives in the top bar). */
export function HomeHero() {
  return <h1 className="text-[2rem] leading-[1.1] font-semibold tracking-tight">{CITY.name}&apos;yi keşfet</h1>;
}
