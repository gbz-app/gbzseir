"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { routes } from "@/core/routes";

/** Ideas typed into the empty field one after another (owner, 12.09: ten of them). */
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

/** Types a hint, holds it, deletes it and types the next one; while `paused` it stays where it is. */
function useTypedHint(paused: boolean): string {
  const [state, setState] = React.useState({ index: 0, len: HINTS[0].length, deleting: false });
  React.useEffect(() => {
    if (paused || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const full = HINTS[state.index];
    let next = state;
    let delay: number;
    if (!state.deleting) {
      if (state.len < full.length) [next, delay] = [{ ...state, len: state.len + 1 }, 60];
      else [next, delay] = [{ ...state, deleting: true }, 1400];
    } else if (state.len > 0) [next, delay] = [{ ...state, len: state.len - 1 }, 30];
    else [next, delay] = [{ index: (state.index + 1) % HINTS.length, len: 0, deleting: false }, 250];
    const id = window.setTimeout(() => setState(next), delay);
    return () => window.clearTimeout(id);
  }, [state, paused]);
  return HINTS[state.index].slice(0, state.len);
}

/**
 * Home search field (rounded like the home cards, not a pill): submits to /ara?q=... While it is empty and not focused
 * the placeholder types and deletes the HINTS one after another (the first hint in full on the server, so hydration
 * matches; reduced motion keeps it still).
 */
export function HomeSearch() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const hint = useTypedHint(!!q || focused);

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
        placeholder={focused ? "Ara" : hint}
        aria-label="Ara"
        enterKeyHint="search"
        maxLength={80}
        className="h-13 w-full rounded-[1.25rem] bg-card pr-4 pl-12 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </form>
  );
}
