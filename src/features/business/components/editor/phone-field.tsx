"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { digitsOnly, formatPhoneInputTR, normalizePhoneTR } from "@/core/phone";

/** Business phone (mobile or landline, e.g. 262 ...) -> E.164 or null. */
export function businessPhoneE164(input: string): string | null {
  return normalizePhoneTR(digitsOnly(input), { allowLandline: true });
}

/** "+90 | 5XX XXX XX XX" input that also accepts landlines (0262 ...). Value is the formatted national number. */
export function PhoneField({
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-12 items-center overflow-hidden rounded-card border border-input bg-card transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        invalid && "border-destructive ring-3 ring-destructive/20",
      )}
    >
      <span className="flex h-full items-center border-r bg-muted/60 px-3.5 font-bold text-muted-foreground select-none" aria-hidden>
        +90
      </span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="5XX XXX XX XX"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={value}
        maxLength={13}
        onChange={(e) => onChange(formatPhoneInputTR(e.target.value))}
        className="h-full min-w-0 flex-1 bg-transparent px-3.5 text-base font-semibold tracking-wide tabular-nums outline-none placeholder:font-normal placeholder:text-muted-foreground/70"
      />
    </div>
  );
}
