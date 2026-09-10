"use client";

import * as React from "react";
import { Check, MapPinned, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useNeighbourhoods } from "@/lib/neighbourhoods";
import { trIncludes } from "@/core/tr";

/** Neighbourhoods the business travels to; "Tüm Gebze" selects every neighbourhood. */
export function AreaPicker({ value, onChange, id }: { value: string[]; onChange: (v: string[]) => void; id?: string }) {
  const { neighbourhoods, loading, error, reload } = useNeighbourhoods();
  const [query, setQuery] = React.useState("");
  const allIds = React.useMemo(() => neighbourhoods.map((n) => String(n.id)), [neighbourhoods]);
  const all = allIds.length > 0 && allIds.every((nid) => value.includes(nid));
  const toggle = (nid: string) => onChange(value.includes(nid) ? value.filter((x) => x !== nid) : [...value, nid]);

  if (error) {
    return (
      <div className="rounded-2xl border border-dashed p-5 text-center text-sm text-muted-foreground">
        {error}
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={reload}>
          Tekrar dene
        </Button>
      </div>
    );
  }

  const filtered = query.trim() ? neighbourhoods.filter((n) => trIncludes(n.name, query)) : neighbourhoods;

  return (
    <div id={id} className="flex flex-col gap-3">
      <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 bg-card px-4 py-3 has-[button[aria-checked=true]]:border-primary has-[button[aria-checked=true]]:bg-brand-soft">
        <MapPinned className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold">Tüm Gebze</span>
          <span className="block text-xs text-muted-foreground">Gebze&apos;nin bütün mahallelerine gidiyorum.</span>
        </span>
        <Switch checked={all} onCheckedChange={(c) => onChange(c ? allIds : [])} aria-label="Tüm Gebze" disabled={loading} />
      </label>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Mahalle ara" aria-label="Mahalle ara" className="h-11 pl-10" />
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
        {all ? "Tüm mahalleler seçili" : value.length > 0 ? `${value.length} mahalle seçildi` : "Gittiğin mahalleleri seç"}
      </p>

      {loading ? (
        <div className="flex flex-wrap gap-2" aria-busy="true">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-24 rounded-full" />
          ))}
        </div>
      ) : (
        <div role="group" aria-label="Mahalleler" className="flex flex-wrap gap-2">
          {filtered.map((n) => {
            const nid = String(n.id);
            const active = value.includes(nid);
            return (
              <button
                key={nid}
                type="button"
                role="checkbox"
                aria-checked={active}
                onClick={() => toggle(nid)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                )}
              >
                {active ? <Check className="size-4" aria-hidden /> : null}
                {n.name}
              </button>
            );
          })}
          {filtered.length === 0 ? <p className="w-full py-3 text-center text-sm text-muted-foreground">Eşleşen mahalle yok.</p> : null}
        </div>
      )}
    </div>
  );
}
