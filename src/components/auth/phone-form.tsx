"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { digitsOnly, formatPhoneInputTR, isValidTRMobile, normalizePhoneTR } from "@/core/phone";
import { routes } from "@/core/routes";

export type PhoneFormProps = {
  /**
   * Called with the E.164 phone (+905XXXXXXXXX). Return a Turkish error message to show it,
   * or nothing on success (navigate in the handler).
   */
  onSubmit: (phone: string, extras: { marketingConsent: boolean }) => Promise<string | void> | string | void;
  /** Button text (default "Kod Gönder"). */
  submitLabel?: string;
  /** Field label (default "Cep telefonu"). */
  label?: string;
  /** Pre-filled phone in any notation. */
  defaultPhone?: string | null;
  /** Show the required KVKK/terms checkbox and the optional marketing checkbox (login screen). */
  showConsents?: boolean;
  autoFocus?: boolean;
  className?: string;
};

/** "+90 | 5XX XXX XX XX" phone field with validation (TR mobile only) and optional consent checkboxes. */
export function PhoneForm({
  onSubmit,
  submitLabel = "Kod Gönder",
  label = "Cep telefonu",
  defaultPhone,
  showConsents,
  autoFocus = true,
  className,
}: PhoneFormProps) {
  const [value, setValue] = React.useState(() => (defaultPhone ? formatPhoneInputTR(defaultPhone.replace(/^\+?90/, "")) : ""));
  const [terms, setTerms] = React.useState(false);
  const [marketing, setMarketing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const inputId = React.useId();

  const national = digitsOnly(value);
  const valid = isValidTRMobile(national);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!valid) {
      setFieldError(national.length === 0 ? "Telefon numaranı yaz." : "Geçerli bir cep telefonu numarası gir (5XX XXX XX XX).");
      return;
    }
    if (showConsents && !terms) {
      setError("Devam etmek için Kullanım Koşulları ve KVKK Aydınlatma Metni'ni onaylamalısın.");
      return;
    }
    setPending(true);
    const res = await onSubmit(normalizePhoneTR(national)!, { marketingConsent: marketing });
    if (typeof res === "string" && res) {
      setError(res);
      setPending(false);
    }
    // On success the caller navigates; keep the button in its loading state.
  };

  return (
    <form onSubmit={submit} noValidate className={cn("flex flex-col gap-5", className)}>
      <div>
        <Label htmlFor={inputId} className="mb-2 block text-sm font-semibold">
          {label}
        </Label>
        <div
          className={cn(
            "flex h-14 items-center overflow-hidden rounded-2xl border border-input bg-card transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
            fieldError && "border-destructive ring-3 ring-destructive/20",
          )}
        >
          <span className="flex h-full items-center border-r bg-muted/60 px-4 text-lg font-bold text-muted-foreground select-none" aria-hidden>
            +90
          </span>
          <input
            id={inputId}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            autoFocus={autoFocus}
            placeholder="5XX XXX XX XX"
            aria-label={`${label}, +90 ile başlayan`}
            aria-invalid={!!fieldError || undefined}
            aria-describedby={fieldError ? `${inputId}-err` : undefined}
            value={value}
            maxLength={13}
            onChange={(e) => {
              setValue(formatPhoneInputTR(e.target.value));
              setFieldError(null);
            }}
            className="h-full min-w-0 flex-1 bg-transparent px-4 text-lg font-semibold tracking-wide tabular-nums outline-none placeholder:font-normal placeholder:text-muted-foreground/70"
          />
        </div>
        {fieldError ? (
          <p id={`${inputId}-err`} className="mt-2 text-sm font-medium text-destructive">
            {fieldError}
          </p>
        ) : null}
      </div>

      {showConsents ? (
        <div className="flex flex-col gap-3">
          <label className="flex items-start gap-3 text-sm leading-snug">
            <Checkbox checked={terms} onCheckedChange={(c) => setTerms(c === true)} className="mt-0.5" aria-required="true" />
            <span>
              <Link href={routes.legal.terms()} target="_blank" className="font-semibold text-primary underline underline-offset-2">
                Kullanım Koşulları
              </Link>{" "}
              ve{" "}
              <Link href={routes.legal.kvkk()} target="_blank" className="font-semibold text-primary underline underline-offset-2">
                KVKK Aydınlatma Metni
              </Link>
              &apos;ni okudum.
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm leading-snug text-muted-foreground">
            <Checkbox checked={marketing} onCheckedChange={(c) => setMarketing(c === true)} className="mt-0.5" />
            <span>Kampanya ve duyuru bildirimleri almak istiyorum. (İsteğe bağlı)</span>
          </label>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="h-13 w-full text-base" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        {submitLabel}
      </Button>
    </form>
  );
}
