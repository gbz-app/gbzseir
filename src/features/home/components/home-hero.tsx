import { CITY } from "@/config/site";

/** Left-aligned headline of the home page (the greeting lives in the top bar). */
export function HomeHero() {
  return (
    <h1 className="max-w-[19rem] text-[2rem] leading-[1.1] font-semibold tracking-tight text-balance">
      {CITY.name}&apos;de bugün neye ihtiyacın var?
    </h1>
  );
}
