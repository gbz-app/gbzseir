"use client";

import { CITY } from "@/config/site";
import { useAuth } from "@/lib/auth/auth-provider";

/** Greeting ("Merhaba, Ahmet" + weather pill) and the big headline of the home page. */
export function HomeHero({ weatherBadge }: { weatherBadge: string | null }) {
  const { profile } = useAuth();
  const first = profile?.full_name?.trim().split(/\s+/)[0];
  return (
    <section className="flex flex-col items-center pt-1 text-center">
      <p className="flex items-center gap-2 text-[15px] font-medium text-foreground/80">
        {first ? `Merhaba, ${first}` : "Merhaba"}
        {weatherBadge ? <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground tabular-nums">{weatherBadge}</span> : null}
      </p>
      <h1 className="mt-2.5 max-w-[20rem] text-[2rem] leading-[1.1] font-medium tracking-tight text-balance">
        {CITY.name}&apos;de bugün neye ihtiyacın var?
      </h1>
    </section>
  );
}
