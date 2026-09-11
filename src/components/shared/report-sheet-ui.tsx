"use client";

import * as React from "react";
import { Check, ChevronRight, CircleAlert, Info, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Shared building blocks of the report sheets (ReportSheet: şikayet, InfoReportSheet: "Bilgi hatalı mı?").
 * No borders or shadows: white rows on the lavender sheet ground.
 */

/** BottomSheet className of the report sheets: lavender ground, so the white rows read as cards. */
export const REPORT_SHEET_CLASS = "bg-background";

/** Black primary CTA of a report sheet (white on dark). */
export const REPORT_CTA = "h-12 w-full rounded-full bg-foreground text-base font-semibold text-background shadow-none hover:bg-foreground/90";

export type ReportOption<T extends string> = { value: T; label: string; icon: LucideIcon };

/** One step of a report sheet. It takes focus on step change (tabIndex -1) so screen readers follow the flow. */
export function ReportStep({ label, className, children, ref }: { label: string; className?: string; children: React.ReactNode; ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} role="group" aria-label={label} tabIndex={-1} className={cn("animate-in outline-none duration-200 fade-in-0 motion-reduce:animate-none", className)}>
      {children}
    </div>
  );
}

/** Thin segmented progress under the sheet header (decorative; the step group carries "Adım 1 / 2"). */
export function ReportProgress({ index, count }: { index: number; count: number }) {
  return (
    <div className="mb-4 flex items-center gap-1.5" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= index ? "bg-primary" : "bg-foreground/10")} />
      ))}
    </div>
  );
}

/** Big white rows with an icon each. Selected: brand-soft row + check. */
export function ReasonRows<T extends string>({
  options,
  value,
  onSelect,
  ariaLabel,
}: {
  options: ReportOption<T>[];
  value: T | "" | null;
  onSelect: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <ul aria-label={ariaLabel} className="flex flex-col gap-2">
      {options.map(({ value: v, label, icon: Icon }) => {
        const active = v === value;
        return (
          <li key={v}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(v)}
              className={cn(
                "flex min-h-16 w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "bg-brand-soft" : "bg-card hover:bg-muted/70 active:bg-muted",
              )}
            >
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                  active ? "bg-primary text-primary-foreground" : "bg-brand-soft text-primary",
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 text-[15px] leading-snug font-semibold">{label}</span>
              {active ? (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden>
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              ) : (
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Wrapping single-choice chips with an icon each (white; selected: filled purple + check). */
export function ReasonChips<T extends string>({
  options,
  value,
  onSelect,
  labelledBy,
}: {
  options: ReportOption<T>[];
  value: T | null;
  onSelect: (value: T) => void;
  labelledBy: string;
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
      {options.map(({ value: v, label, icon: Icon }) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(v)}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted/70",
            )}
          >
            {active ? <Check className="size-4 shrink-0" strokeWidth={3} aria-hidden /> : <Icon className="size-4 shrink-0 text-primary" aria-hidden />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** "What is reported" card: icon, small eyebrow, bold title and an optional action ("Değiştir"). */
export function ReportSummary({ icon: Icon, eyebrow, title, action }: { icon: LucideIcon; eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card p-3.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-muted-foreground">{eyebrow}</p>
        <p className="text-[15px] leading-snug font-semibold">{title}</p>
      </div>
      {action}
    </div>
  );
}

/** Note textarea (white, no border) with a hint and a character counter. */
export function NoteField({
  id,
  label,
  value,
  onChange,
  max,
  placeholder,
  hint,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  placeholder?: string;
  hint?: React.ReactNode;
  invalid?: boolean;
}) {
  const metaId = `${id}-meta`;
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 block px-1 text-sm font-semibold">
        {label}
      </Label>
      <Textarea
        id={id}
        value={value}
        maxLength={max}
        rows={4}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-describedby={metaId}
        aria-invalid={invalid || undefined}
        className="min-h-28 rounded-2xl border-transparent bg-card dark:bg-card"
      />
      <div id={metaId} className="mt-1.5 flex justify-between gap-3 px-1 text-xs text-muted-foreground">
        <span className={cn(invalid && "font-medium text-destructive")}>{hint}</span>
        <span className="shrink-0 tabular-nums">
          {value.length}/{max}
        </span>
      </div>
    </div>
  );
}

/** Inline result message inside the sheet (errors in red, "already sent" style notes in white). */
export function ReportAlert({ tone = "error", children }: { tone?: "error" | "info"; children: React.ReactNode }) {
  const Icon = tone === "info" ? Info : CircleAlert;
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-sm leading-snug font-medium",
        tone === "info" ? "bg-card text-foreground" : "bg-destructive/10 text-destructive",
      )}
    >
      <Icon className={cn("mt-px size-[18px] shrink-0", tone === "info" && "text-primary")} aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Success state shown inside the sheet after sending. */
export function ReportSuccess({ title = "Teşekkürler!", message = "Bildirimin alındı. Ekibimiz inceleyecek." }: { title?: string; message?: string }) {
  return (
    <div role="status" className="flex flex-col items-center px-4 pt-8 pb-4 text-center">
      <span className="flex size-20 animate-in items-center justify-center rounded-full bg-success-soft text-success duration-300 fade-in-0 zoom-in-50 motion-reduce:animate-none">
        <Check className="size-10" strokeWidth={3} aria-hidden />
      </span>
      <p className="mt-5 text-xl font-bold">{title}</p>
      <p className="mt-1.5 max-w-xs text-[15px] leading-relaxed text-muted-foreground">{message}</p>
    </div>
  );
}
