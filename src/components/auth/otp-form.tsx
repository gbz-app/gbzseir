"use client";

import * as React from "react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { OTP_DEMO_MODE } from "@/config/site";
import { IS_ADMIN_SITE } from "@/config/app-mode";
import { DemoOtpBanner } from "./demo-otp-banner";

export type OtpFormProps = {
  /** E.164 phone the code was sent to (used by the demo banner). */
  phone: string;
  /** Verify the 6-digit code. Return a Turkish error message to show it, or nothing on success (navigate yourself). */
  onVerify: (code: string) => Promise<string | void> | string | void;
  /** Send a new code. Return an error message or nothing. */
  onResend: () => Promise<string | void> | string | void;
  /** Seconds before "Kodu tekrar gönder" is enabled (default 60). */
  resendAfter?: number;
  /** Show the prototype banner with the captured code (default: NEXT_PUBLIC_OTP_DEMO_MODE). */
  demoMode?: boolean;
  submitLabel?: string;
  className?: string;
};

type OTPCredentialLike = Credential & { code?: string };

/**
 * 6-box code entry: autocomplete="one-time-code", numeric keyboard, WebOTP on Android,
 * auto-submit on 6 digits, 60 s resend countdown, optional demo banner.
 */
export function OtpForm({
  phone,
  onVerify,
  onResend,
  resendAfter = 60,
  // Admins never get a demo code (get_demo_otp refuses admin phones): no demo banner on the admin site.
  demoMode = OTP_DEMO_MODE && !IS_ADMIN_SITE,
  submitLabel = "Doğrula",
  className,
}: OtpFormProps) {
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  const [resendAt, setResendAt] = React.useState(() => Date.now() + resendAfter * 1000);
  const [now, setNow] = React.useState(() => Date.now());
  const [nonce, setNonce] = React.useState(0);
  const busyRef = React.useRef(false);
  const verifyRef = React.useRef(onVerify);
  React.useEffect(() => {
    verifyRef.current = onVerify;
  }, [onVerify]);

  const submit = React.useCallback(async (c: string) => {
    if (c.length !== 6 || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const res = await verifyRef.current(c);
    if (typeof res === "string" && res) {
      setError(res);
      setCode("");
      setBusy(false);
      busyRef.current = false;
    }
  }, []);

  // Countdown.
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  // WebOTP (Android Chrome): read the code from the SMS automatically.
  React.useEffect(() => {
    if (typeof window === "undefined" || !("OTPCredential" in window)) return;
    const ac = new AbortController();
    (navigator.credentials.get({ otp: { transport: ["sms"] }, signal: ac.signal } as CredentialRequestOptions) as Promise<OTPCredentialLike | null>)
      .then((cred) => {
        if (cred?.code && /^\d{6}$/.test(cred.code)) {
          setCode(cred.code);
          void submit(cred.code);
        }
      })
      .catch(() => undefined);
    return () => ac.abort();
  }, [submit, nonce]);

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const resend = async () => {
    if (secondsLeft > 0 || resending) return;
    setResending(true);
    setError(null);
    const res = await onResend();
    setResending(false);
    if (typeof res === "string" && res) {
      setError(res);
      return;
    }
    setResendAt(Date.now() + resendAfter * 1000);
    setCode("");
    setNonce((n) => n + 1);
    toast.success("Yeni kod gönderildi");
  };

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {demoMode ? (
        <DemoOtpBanner
          phone={phone}
          nonce={nonce}
          onFill={(c) => {
            setCode(c);
            void submit(c);
          }}
        />
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(code);
        }}
        className="flex flex-col gap-5"
      >
        <InputOTP
          maxLength={6}
          value={code}
          onChange={(v) => {
            setCode(v);
            if (error) setError(null);
          }}
          onComplete={(v: string) => void submit(v)}
          pattern={REGEXP_ONLY_DIGITS}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          disabled={busy}
          aria-label="6 haneli doğrulama kodu"
          containerClassName="justify-center"
        >
          <InputOTPGroup className="gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <InputOTPSlot
                key={i}
                index={i}
                aria-invalid={!!error || undefined}
                className="size-12 rounded-xl border bg-card text-2xl font-bold first:rounded-xl first:border-l last:rounded-xl min-[380px]:size-13"
              />
            ))}
          </InputOTPGroup>
        </InputOTP>

        {error ? (
          <p role="alert" className="text-center text-sm font-semibold text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="h-13 w-full text-base" disabled={busy || code.length !== 6}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {submitLabel}
        </Button>
      </form>

      <div className="text-center text-sm">
        {secondsLeft > 0 ? (
          <p className="text-muted-foreground" aria-live="polite">
            Kodu tekrar gönderebilmek için <span className="font-bold text-foreground tabular-nums">{secondsLeft} sn</span>
          </p>
        ) : (
          <Button type="button" variant="link" onClick={resend} disabled={resending} className="font-semibold">
            {resending ? <Loader2 className="animate-spin" /> : null}
            Kodu tekrar gönder
          </Button>
        )}
      </div>
    </div>
  );
}
