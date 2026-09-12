"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { routes } from "@/core/routes";

/** Ideas shown in the empty field, one after another (owner, 12.09: ten of them, a new one every ~2 seconds). */
const HINTS = [
  "Nöbetçi eczane ara",
  "En yakın taksi durağı",
  "Gebze'de kahvaltı mekânları",
  "Usta mı arıyorsun?",
  "Bu hafta sonu etkinlikler",
  "Otobüs durakları ve saatleri",
  "Kocaeli'de gezilecek yerler",
  "Kafe ve restoranlar",
  "İkinci el ilanlar",
  "İş ilanları",
] as const;
const HINT_MS = 2000;

/**
 * Home search field (rounded like the home cards, not a pill): submits to /ara?q=... While it is empty and not focused
 * the placeholder cycles through HINTS (the first one on the server, so hydration matches).
 */
export function HomeSearch() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const [hint, setHint] = React.useState(0);

  React.useEffect(() => {
    if (q || focused) return;
    const id = window.setInterval(() => setHint((i) => (i + 1) % HINTS.length), HINT_MS);
    return () => window.clearInterval(id);
  }, [q, focused]);

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        const value = q.trim();
        router.push(value ? routes.search(value) : routes.search());
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.25} aria-hidden />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={HINTS[hint]}
        aria-label="Ara"
        enterKeyHint="search"
        maxLength={80}
        className="h-13 w-full rounded-[1.25rem] bg-card pr-4 pl-12 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </form>
  );
}
