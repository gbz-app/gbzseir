"use client";

import { CITY } from "@/config/site";
import { useAuth } from "@/lib/auth/auth-provider";

/** Left-aligned greeting and headline of the home page. */
export function HomeHero() {
  const { profile } = useAuth();
  const first = profile?.full_name?.trim().split(/\s+/)[0];
  return (
    <section className="pt-1">
      <p className="text-[15px] font-medium text-muted-foreground">{first ? `Merhaba, ${first}` : "Merhaba"}</p>
      <h1 className="mt-1 max-w-[19rem] text-[2rem] leading-[1.1] font-medium tracking-tight text-balance">{CITY.name}&apos;de bugün neye ihtiyacın var?</h1>
    </section>
  );
}
