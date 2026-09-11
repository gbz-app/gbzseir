"use client";

import * as React from "react";
import { Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { trCompare, trIncludes } from "@/core/tr";

type Category = { id: string; name: string; slug: string; parent_id: string | null; sort: number; synonyms: string[] | null };
type Group = { id: string; name: string; items: Category[] };

let cache: Group[] | null = null;

async function loadGroups(): Promise<Group[]> {
  if (cache) return cache;
  const { data, error } = await createClient()
    .from("service_categories")
    .select("id,name,slug,parent_id,sort,synonyms")
    .eq("active", true)
    .order("sort")
    .order("name");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Category[];
  const parents = rows.filter((c) => !c.parent_id);
  const groups = parents
    .map((p) => ({ id: p.id, name: p.name, items: rows.filter((c) => c.parent_id === p.id).sort((a, b) => a.sort - b.sort || trCompare(a.name, b.name)) }))
    .filter((g) => g.items.length > 0);
  cache = groups;
  return groups;
}

/** id -> name of every active service sub-category (for summaries); empty until loaded. */
export function useServiceCategoryNames(): Map<string, string> {
  const [groups, setGroups] = React.useState<Group[] | null>(cache);
  React.useEffect(() => {
    let active = true;
    loadGroups()
      .then((g) => active && setGroups(g))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return React.useMemo(() => new Map((groups ?? []).flatMap((g) => g.items.map((c) => [c.id, c.name] as const))), [groups]);
}

/**
 * FilterChip look without a border: white chip, black when chosen (with a check). On a white surface (EditCard bg-card,
 * dialog bg-popover) the idle chip turns bg-muted so it still shows.
 */
const CHIP =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const CHIP_ON = "bg-foreground text-background";
const CHIP_OFF =
  "bg-card text-foreground hover:bg-muted in-[.bg-card]:bg-muted in-[.bg-card]:hover:bg-foreground/10 in-[.bg-popover]:bg-muted in-[.bg-popover]:hover:bg-foreground/10";

/** Multi-select of service sub-categories, grouped by their parent (what the business can be dispatched for). */
export function CategoryPicker({ value, onChange, id }: { value: string[]; onChange: (v: string[]) => void; id?: string }) {
  const [groups, setGroups] = React.useState<Group[] | null>(cache);
  const [error, setError] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    loadGroups()
      .then((g) => active && setGroups(g))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [nonce]);

  const toggle = (cid: string) => onChange(value.includes(cid) ? value.filter((x) => x !== cid) : [...value, cid]);

  if (error) {
    return (
      <div className="rounded-2xl bg-card p-5 text-center text-sm text-muted-foreground in-[.bg-card]:bg-muted in-[.bg-popover]:bg-muted">
        Kategoriler yüklenemedi.
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => {
            setError(false);
            setNonce((n) => n + 1);
          }}
        >
          Tekrar dene
        </Button>
      </div>
    );
  }
  if (!groups) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i}>
            <Skeleton className="h-4 w-32" />
            <div className="mt-2 flex flex-wrap gap-2">
              <Skeleton className="h-10 w-28 rounded-full" />
              <Skeleton className="h-10 w-36 rounded-full" />
              <Skeleton className="h-10 w-24 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const q = query.trim();
  const visible = groups
    .map((g) => ({ ...g, items: q ? g.items.filter((c) => trIncludes(c.name, q) || trIncludes(g.name, q) || (c.synonyms ?? []).some((s) => trIncludes(s, q))) : g.items }))
    .filter((g) => g.items.length > 0);

  return (
    <div id={id} className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hizmet ara (örn. boya, kombi)" aria-label="Hizmet ara" className="h-11 pl-10" />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Aramayı temizle"
            className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      <p className="text-sm font-semibold text-muted-foreground" aria-live="polite">
        {value.length > 0 ? `${value.length} hizmet seçildi` : "Verdiğin hizmetleri seç"}
      </p>
      {visible.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">&quot;{q}&quot; ile eşleşen hizmet yok.</p> : null}
      {visible.map((g) => (
        <div key={g.id} role="group" aria-label={g.name}>
          <p className="mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">{g.name}</p>
          <div className="flex flex-wrap gap-2">
            {g.items.map((c) => {
              const active = value.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  onClick={() => toggle(c.id)}
                  className={cn(CHIP, "px-4", active ? CHIP_ON : CHIP_OFF)}
                >
                  {active ? <Check className="size-4" aria-hidden /> : null}
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
