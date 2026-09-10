"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { routes } from "@/core/routes";

/** Home search field: submits to /ara?q=... */
export function HomeSearch() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
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
      <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} aria-hidden />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Eczane, usta, ilan ya da yer ara"
        aria-label="Ara"
        enterKeyHint="search"
        maxLength={80}
        className="h-13 w-full rounded-full bg-card pr-4 pl-12 text-base shadow-soft ring-1 ring-foreground/[0.06] outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </form>
  );
}
