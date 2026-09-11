"use client";

import * as React from "react";
import { Check, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addDaysToKey, istanbulDateKey } from "@/core/time";
import { formatDate } from "@/core/format";
import type { FlowAnswerValue, FlowStep } from "@/core/flow";

export type QuestionRendererProps = {
  step: FlowStep;
  value: FlowAnswerValue | undefined;
  onChange: (value: FlowAnswerValue) => void;
  /** Called shortly after a 'single' option is chosen (wizard next()). */
  onAutoAdvance?: () => void;
  /** Validation message for this question (shown by the Wizard already; pass to highlight fields). */
  error?: string | null;
  /** Focus text/number inputs on mount. */
  autoFocus?: boolean;
};

/** Renders one question of the flow JSON contract (single | multi | number | text | date). */
export function QuestionRenderer({ step, value, onChange, onAutoAdvance, error, autoFocus }: QuestionRendererProps) {
  switch (step.type) {
    case "single":
      return <SingleChoice step={step} value={typeof value === "string" ? value : null} onChange={onChange} onAutoAdvance={onAutoAdvance} />;
    case "multi":
      return <MultiChoice step={step} value={Array.isArray(value) ? value : []} onChange={onChange} />;
    case "number":
      return <NumberQuestion step={step} value={typeof value === "number" ? value : value ? Number(value) : null} onChange={onChange} invalid={!!error} autoFocus={autoFocus} />;
    case "text":
      return <TextQuestion step={step} value={typeof value === "string" ? value : ""} onChange={onChange} invalid={!!error} autoFocus={autoFocus} />;
    case "date":
      return <DateQuestion step={step} value={typeof value === "string" ? value : null} onChange={onChange} invalid={!!error} />;
    default:
      return null;
  }
}

/** Borderless white row; the chosen one turns brand-soft with a check (same as the listing wizard's category rows). */
const optionBase =
  "flex min-h-14 w-full items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left text-[15px] font-semibold transition-[background-color,color,transform] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]";
const optionActive = "bg-brand-soft text-primary hover:bg-brand-soft";

function OptionText({ label, description }: { label: string; description?: string }) {
  return (
    <span className="min-w-0 flex-1 break-words">
      {label}
      {description ? <span className="mt-0.5 block text-xs font-medium text-muted-foreground">{description}</span> : null}
    </span>
  );
}

function SingleChoice({ step, value, onChange, onAutoAdvance }: { step: FlowStep; value: string | null; onChange: (v: string) => void; onAutoAdvance?: () => void }) {
  const timer = React.useRef<number | null>(null);
  React.useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  const options = step.options ?? [];
  return (
    <div role="radiogroup" aria-label={typeof step.title === "string" ? step.title : undefined} className={cn("grid gap-2.5", options.length > 6 && options.every((o) => o.label.length <= 16) && "grid-cols-2")}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              onChange(o.value);
              if (onAutoAdvance) {
                if (timer.current) window.clearTimeout(timer.current);
                timer.current = window.setTimeout(onAutoAdvance, 220);
              }
            }}
            className={cn(optionBase, active && optionActive)}
          >
            <OptionText label={o.label} description={o.description} />
            {active ? <Check className="size-5 shrink-0 text-primary" strokeWidth={2.6} aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}

function MultiChoice({ step, value, onChange }: { step: FlowStep; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const hint =
    step.min && step.max ? `${step.min}-${step.max} seçenek seç` : step.min ? `En az ${step.min} seçenek seç` : step.max ? `En fazla ${step.max} seçenek` : "Birden fazla seçebilirsin";
  return (
    <div>
      <p className="mb-3 text-sm font-medium text-muted-foreground">{hint}</p>
      <div className="grid gap-2.5">
        {(step.options ?? []).map((o) => {
          const active = value.includes(o.value);
          const atMax = !active && step.max !== undefined && value.length >= step.max;
          return (
            <button
              key={o.value}
              type="button"
              role="checkbox"
              aria-checked={active}
              disabled={atMax}
              onClick={() => toggle(o.value)}
              className={cn(optionBase, active && optionActive, atMax && "opacity-50")}
            >
              <OptionText label={o.label} description={o.description} />
              {/* Filled square (no outline) so several picks read as checkboxes. */}
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-lg transition-colors",
                  active ? "bg-primary text-primary-foreground" : "bg-foreground/10",
                )}
                aria-hidden
              >
                {active ? <Check className="size-3.5" strokeWidth={3} /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Round-cornered white stepper button, no border. */
const STEPPER =
  "flex size-12 shrink-0 items-center justify-center rounded-xl bg-card transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

function NumberQuestion({
  step,
  value,
  onChange,
  invalid,
  autoFocus,
}: {
  step: FlowStep;
  value: number | null;
  onChange: (v: number | null) => void;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const inc = (d: number) => {
    const base = value ?? step.min ?? 0;
    let n = base + d;
    if (step.min !== undefined) n = Math.max(step.min, n);
    if (step.max !== undefined) n = Math.min(step.max, n);
    onChange(n);
  };
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => inc(-1)} aria-label="Azalt" className={STEPPER}>
        <Minus className="size-5" />
      </button>
      <div className="relative flex-1">
        <Input
          type="number"
          inputMode="numeric"
          autoFocus={autoFocus}
          value={value ?? ""}
          min={step.min}
          max={step.max}
          placeholder={step.placeholder}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className={cn("h-12 text-center text-xl font-bold tabular-nums", step.unit && "pr-14")}
        />
        {step.unit ? <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm font-semibold text-muted-foreground">{step.unit}</span> : null}
      </div>
      <button type="button" onClick={() => inc(1)} aria-label="Artır" className={STEPPER}>
        <Plus className="size-5" />
      </button>
    </div>
  );
}

function TextQuestion({ step, value, onChange, invalid, autoFocus }: { step: FlowStep; value: string; onChange: (v: string) => void; invalid?: boolean; autoFocus?: boolean }) {
  const multiline = step.multiline ?? (step.max === undefined || step.max > 120);
  const common = {
    value,
    autoFocus,
    maxLength: step.max,
    placeholder: step.placeholder,
    "aria-invalid": invalid || undefined,
  };
  return (
    <div>
      {multiline ? (
        <Textarea {...common} rows={4} onChange={(e) => onChange(e.target.value)} className="min-h-32" />
      ) : (
        <Input {...common} onChange={(e) => onChange(e.target.value)} className="h-12" />
      )}
      {step.max ? (
        <p className="mt-1.5 text-right text-xs text-muted-foreground tabular-nums">
          {value.length}/{step.max}
        </p>
      ) : null}
    </div>
  );
}

function DateQuestion({ step, value, onChange, invalid }: { step: FlowStep; value: string | null; onChange: (v: string) => void; invalid?: boolean }) {
  const today = istanbulDateKey(new Date());
  const minKey = step.min !== undefined ? addDaysToKey(today, step.min) : undefined;
  const maxKey = step.max !== undefined ? addDaysToKey(today, step.max) : undefined;
  const quick = [
    { label: "Bugün", key: today },
    { label: "Yarın", key: addDaysToKey(today, 1) },
    { label: "2 gün sonra", key: addDaysToKey(today, 2) },
  ].filter((q) => (!minKey || q.key >= minKey) && (!maxKey || q.key <= maxKey));
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {quick.map((q) => (
          <button
            key={q.key}
            type="button"
            aria-pressed={value === q.key}
            onClick={() => onChange(q.key)}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center rounded-2xl bg-card px-2 text-sm font-bold transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
              value === q.key && optionActive,
            )}
          >
            {q.label}
            <span className="text-xs font-medium text-muted-foreground">{formatDate(q.key + "T12:00:00+03:00")}</span>
          </button>
        ))}
      </div>
      <label className="mt-4 block text-sm font-semibold" htmlFor={`date-${step.id}`}>
        Başka bir tarih
      </label>
      <Input
        id={`date-${step.id}`}
        type="date"
        value={value ?? ""}
        min={minKey}
        max={maxKey}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 h-12"
      />
    </div>
  );
}
