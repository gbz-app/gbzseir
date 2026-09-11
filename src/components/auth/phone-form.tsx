"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { IS_ADMIN_SITE, publicUrl } from "@/config/app-mode";
import { TURNSTILE_SITE_KEY } from "@/config/site";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { digitsOnly, formatPhoneInputTR, isValidTRMobile, normalizePhoneTR } from "@/core/phone";
import { routes } from "@/core/routes";

export type PhoneFormProps = {
  /**
   * Called with the E.164 phone (+905XXXXXXXXX). Return a Turkish error message to show it,
   * or nothing on success (navigate in the handler). `captchaToken` is set only when the captcha is on.
   */
  onSubmit: (phone: string, extras: { marketingConsent: boolean; captchaToken?: string }) => Promise<string | void> | string | void;
  /** Button text (default "Kod Gönder"). */
  submitLabel?: string;
  /** Field label (default "Cep telefonu"). */
  label?: string;
  /** Pre-filled phone in any notation. */
  defaultPhone?: string | null;
  /** Show the required KVKK/terms checkbox and the optional marketing checkbox (login screen). */
  showConsents?: boolean;
  /** Protect the send with Cloudflare Turnstile (login screen). Does nothing while NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset. */
  captcha?: boolean;
  autoFocus?: boolean;
  className?: string;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string | undefined;
  remove: (widgetId: string) => void;
};

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let turnstileScript: Promise<TurnstileApi> | null = null;

/** Load the Turnstile script once per tab (explicit rendering). */
function loadTurnstile(): Promise<TurnstileApi> {
  const w = window as Window & { turnstile?: TurnstileApi };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  turnstileScript ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TURNSTILE_SRC;
    s.defer = true;
    s.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error("turnstile unavailable")));
    s.onerror = () => {
      turnstileScript = null;
      s.remove();
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(s);
  });
  return turnstileScript;
}

/** Cloudflare Turnstile widget. Reports a token, or null when it expires or fails. Remount it (key) for a fresh token. */
function TurnstileWidget({ onToken }: { onToken: (token: string | null) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const onTokenRef = React.useRef(onToken);
  React.useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  React.useEffect(() => {
    let active = true;
    let widget: { api: TurnstileApi; id: string } | null = null;
    loadTurnstile()
      .then((api) => {
        if (!active || !ref.current) return;
        const id = api.render(ref.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "auto",
          size: "flexible",
          language: "tr",
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
        if (id) widget = { api, id };
      })
      .catch(() => onTokenRef.current(null));
    return () => {
      active = false;
      if (widget) widget.api.remove(widget.id);
    };
  }, []);

  return <div ref={ref} className="min-h-[65px]" />;
}

/** "+90 | 5XX XXX XX XX" phone field with validation (TR mobile only) and optional consent checkboxes. */
export function PhoneForm({
  onSubmit,
  submitLabel = "Kod Gönder",
  label = "Cep telefonu",
  defaultPhone,
  showConsents,
  captcha,
  autoFocus = true,
  className,
}: PhoneFormProps) {
  const [value, setValue] = React.useState(() => (defaultPhone ? formatPhoneInputTR(defaultPhone.replace(/^\+?90/, "")) : ""));
  const [terms, setTerms] = React.useState(false);
  const [marketing, setMarketing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [captchaToken, setCaptchaToken] = React.useState<string | null>(null);
  const [captchaRound, setCaptchaRound] = React.useState(0);
  const inputId = React.useId();
  const withCaptcha = !!captcha && TURNSTILE_SITE_KEY !== "";

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
    if (withCaptcha && !captchaToken) {
      setError("Güvenlik doğrulaması henüz tamamlanmadı. Birkaç saniye bekleyip tekrar dene.");
      return;
    }
    setPending(true);
    const res = await onSubmit(normalizePhoneTR(national)!, { marketingConsent: marketing, captchaToken: captchaToken ?? undefined });
    if (typeof res === "string" && res) {
      setError(res);
      setPending(false);
      // A Turnstile token works once: get a fresh one for the next try.
      if (withCaptcha) {
        setCaptchaToken(null);
        setCaptchaRound((r) => r + 1);
      }
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
            "flex h-14 items-center overflow-hidden rounded-2xl bg-card transition-[box-shadow] focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
            fieldError && "ring-2 ring-destructive/50",
          )}
        >
          <span className="flex h-full items-center pr-3 pl-5 text-lg font-bold text-muted-foreground select-none" aria-hidden>
            +90
          </span>
          <span className="h-6 w-px shrink-0 bg-foreground/10" aria-hidden />
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
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-lg font-semibold tracking-wide tabular-nums outline-none placeholder:font-normal placeholder:text-muted-foreground/70"
          />
        </div>
        {fieldError ? (
          <p id={`${inputId}-err`} className="mt-2 text-sm font-medium text-destructive">
            {fieldError}
          </p>
        ) : null}
      </div>

      {showConsents ? (
        <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 dark:bg-input/30">
          <label className="flex items-start gap-3 text-sm leading-snug">
            <Checkbox checked={terms} onCheckedChange={(c) => setTerms(c === true)} className="mt-0.5" aria-required="true" />
            <span>
              {/* Legal pages live on the public app (absolute on the separate admin site). */}
              <a href={publicUrl(routes.legal.terms())} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline underline-offset-2">
                Kullanım Koşulları
              </a>{" "}
              ve{" "}
              <a href={publicUrl(routes.legal.kvkk())} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline underline-offset-2">
                KVKK Aydınlatma Metni
              </a>
              &apos;ni okudum.
            </span>
          </label>
          {IS_ADMIN_SITE ? null : (
            <label className="flex items-start gap-3 text-sm leading-snug text-muted-foreground">
              <Checkbox checked={marketing} onCheckedChange={(c) => setMarketing(c === true)} className="mt-0.5" />
              <span>Kampanya ve duyuru bildirimleri almak istiyorum. (İsteğe bağlı)</span>
            </label>
          )}
        </div>
      ) : null}

      {withCaptcha ? <TurnstileWidget key={captchaRound} onToken={setCaptchaToken} /> : null}

      {error ? (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="h-13 w-full text-base shadow-none" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        {submitLabel}
      </Button>
    </form>
  );
}
