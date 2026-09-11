"use client";

import * as React from "react";
import { Check, ChevronLeft, ChevronRight, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { detectTextRisks, TEXT_RISK_LABELS } from "../text-guard";
import type { ListingCategory } from "../types";
import { CategoryIcon } from "./category-icon";

/** Label (with an optional icon) + control + optional hint. */
export function Field({
  id,
  label,
  icon: Icon,
  hint,
  children,
  className,
}: {
  id?: string;
  label: React.ReactNode;
  icon?: LucideIcon;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id} className="text-[15px] leading-snug font-semibold">
        {Icon ? <Icon className="size-[18px] shrink-0 text-primary" aria-hidden /> : null}
        {label}
      </Label>
      {children}
      {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** White row with an icon chip, a label (and hint) and a switch; the whole row toggles. */
export function SwitchRow({
  id,
  label,
  hint,
  icon: Icon,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl bg-card px-3 py-2.5">
      {Icon ? (
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary">
          <Icon className="size-[18px]" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug font-medium break-words">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{hint}</span> : null}
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

/** Live warning when the text contains an IBAN, payment words, a phone number or a URL (the DB flags it too). */
export function TextRiskNotice({ texts }: { texts: Array<string | null | undefined> }) {
  const risks = detectTextRisks(...texts);
  if (!risks.length) return null;
  return (
    <div role="status" className="flex gap-3 rounded-2xl bg-highlight-soft p-4 text-sm">
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-highlight-foreground dark:text-highlight" aria-hidden />
      <p className="leading-relaxed">
        Metinde <strong>{risks.map((r) => TEXT_RISK_LABELS[r]).join(", ")}</strong> var. Güvenliğin için telefon numarası, IBAN ya da web adresi
        yazma; numaran &quot;Numarayı göster&quot; ile paylaşılır. Bu ilan yayına alınmadan önce incelenir.
      </p>
    </div>
  );
}

function OptionRow({
  label,
  icon,
  active,
  onClick,
  trailing,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  onClick: () => void;
  trailing?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-16 w-full items-center gap-3 rounded-2xl bg-card px-3 py-2.5 text-left text-[15px] font-semibold transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "bg-brand-soft text-primary hover:bg-brand-soft",
      )}
    >
      <span aria-hidden className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl text-primary", active ? "bg-card" : "bg-brand-soft")}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 break-words">{label}</span>
      {trailing ? (
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      ) : active ? (
        <Check className="size-5 shrink-0 text-primary" aria-hidden />
      ) : null}
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
        <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <CategoryIcon iconName={top.icon} className="size-4 shrink-0" />
          {top.name}
        </p>
        <ul className="flex flex-col gap-2">
          {subs.map((s) => (
            <li key={s.id}>
              <OptionRow
                label={s.name}
                icon={<CategoryIcon iconName={s.icon ?? top.icon} className="size-[22px]" />}
                active={value === s.id}
                onClick={() => onChange(s.id)}
              />
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
            <OptionRow
              label={t.name}
              icon={<CategoryIcon iconName={t.icon} className="size-[22px]" />}
              active={active}
              trailing={hasSubs}
              onClick={() => (hasSubs ? setTopId(t.id) : onChange(t.id))}
            />
          </li>
        );
      })}
    </ul>
  );
}
