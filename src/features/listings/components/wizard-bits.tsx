"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { detectTextRisks, TEXT_RISK_LABELS } from "../text-guard";
import type { ListingCategory } from "../types";

/** Label + control + optional hint. */
export function Field({ id, label, hint, children, className }: { id?: string; label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id} className="text-[15px] font-semibold">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Live warning when the text contains an IBAN, payment words, a phone number or a URL (the DB flags it too). */
export function TextRiskNotice({ texts }: { texts: Array<string | null | undefined> }) {
  const risks = detectTextRisks(...texts);
  if (!risks.length) return null;
  return (
    <div role="status" className="flex gap-3 rounded-2xl bg-highlight-soft p-4 text-sm ring-1 ring-highlight/30">
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-highlight-foreground" aria-hidden />
      <p className="leading-relaxed">
        Metinde <strong>{risks.map((r) => TEXT_RISK_LABELS[r]).join(", ")}</strong> var. Güvenliğin için telefon numarası, IBAN ya da web adresi
        yazma; numaran &quot;Numarayı göster&quot; ile paylaşılır. Bu ilan yayına alınmadan önce incelenir.
      </p>
    </div>
  );
}

function OptionRow({ label, active, onClick, trailing }: { label: string; active?: boolean; onClick: () => void; trailing?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border bg-card px-4 text-left text-[15px] font-semibold transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "border-primary bg-brand-soft text-primary",
      )}
    >
      <span className="min-w-0 break-words">{label}</span>
      {trailing ? <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden /> : null}
    </button>
  );
}

/** Two-level category picker: top categories first, then the sub-categories of the chosen one. */
export function CategoryPicker({ categories, value, onChange }: { categories: ListingCategory[]; value: string | null; onChange: (id: string) => void }) {
  const selected = value ? (categories.find((c) => c.id === value) ?? null) : null;
  const [topId, setTopId] = React.useState<string | null>(selected ? (selected.parent_id ?? null) : null);
  const tops = categories.filter((c) => !c.parent_id);
  const subs = topId ? categories.filter((c) => c.parent_id === topId) : [];
  const top = topId ? categories.find((c) => c.id === topId) : null;

  if (top && subs.length) {
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setTopId(null)}
          className="inline-flex min-h-11 items-center gap-1 self-start rounded-lg pr-2 text-sm font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronLeft className="size-4" aria-hidden /> Tüm kategoriler
        </button>
        <p className="text-sm font-semibold text-muted-foreground">{top.name}</p>
        <ul className="flex flex-col gap-2">
          {subs.map((s) => (
            <li key={s.id}>
              <OptionRow label={s.name} active={value === s.id} onClick={() => onChange(s.id)} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {tops.map((t) => {
        const hasSubs = categories.some((c) => c.parent_id === t.id);
        const active = value === t.id || (!!selected && selected.parent_id === t.id);
        return (
          <li key={t.id}>
            <OptionRow label={t.name} active={active} trailing={hasSubs} onClick={() => (hasSubs ? setTopId(t.id) : onChange(t.id))} />
          </li>
        );
      })}
    </ul>
  );
}
