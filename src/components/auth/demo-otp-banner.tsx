"use client";

import * as React from "react";
import { FlaskConical, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchDemoOtp, isDemoOtpPhone } from "@/lib/auth/otp";
import { createClient } from "@/lib/supabase/client";

export type DemoOtpBannerProps = {
  /** E.164 phone the code was sent to. */
  phone: string;
  /** Change this value to poll again (e.g. after "Kodu tekrar gönder"). */
  nonce?: number;
  /** Fill the code into the form. */
  onFill: (code: string) => void;
};

const POLL_MS = 1500;
const MAX_TRIES = 10;

/**
 * Browser read of app_settings.otp_demo_mode (public read) for OTP screens whose page passes no server value.
 * False until loaded, and whenever `enabled` is false.
 */
export function useOtpDemoModeSetting(enabled: boolean): boolean {
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    if (!enabled) return;
    let active = true;
    void createClient()
      .from("app_settings")
      .select("value")
      .eq("key", "otp_demo_mode")
      .maybeSingle()
      .then(({ data }) => {
        if (active) setOn(data?.value === true);
      });
    return () => {
      active = false;
    };
  }, [enabled]);
  return enabled && on;
}

/**
 * PROTOTYPE ONLY (app_settings.otp_demo_mode = true): no SMS is sent; the code captured by the Send-SMS hook
 * is read with rpc('get_demo_otp') and shown in a clearly labelled amber banner.
 * The RPC decides who sees a code: demo numbers (+90555000XXXX) and brand-new sign-ups. For a number with a
 * confirmed account (or an admin) it stays null; after the tries the banner shows a neutral text (it cannot tell a
 * slow new sign-up from an existing account) instead of retrying.
 */
export function DemoOtpBanner({ phone, nonce = 0, onFill }: DemoOtpBannerProps) {
  const [state, setState] = React.useState<{ key: string; code: string | null; done: boolean }>({ key: "", code: null, done: false });
  const [retry, setRetry] = React.useState(0);
  const key = `${phone}|${nonce}|${retry}`;

  React.useEffect(() => {
    let active = true;
    let tries = 0;
    let timer: number | undefined;
    const tick = async () => {
      tries += 1;
      const code = await fetchDemoOtp(phone);
      if (!active) return;
      if (code) {
        setState({ key, code, done: true });
        return;
      }
      if (tries >= MAX_TRIES) {
        setState({ key, code: null, done: true });
        return;
      }
      timer = window.setTimeout(tick, POLL_MS);
    };
    timer = window.setTimeout(tick, 600);
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [phone, key]);

  const current = state.key === key ? state : { key, code: null, done: false };

  return (
    <div role="status" className="rounded-2xl bg-highlight-soft px-4 py-3 text-highlight-foreground dark:text-foreground">
      <p className="flex items-center gap-2 text-xs font-extrabold tracking-wide uppercase">
        <FlaskConical className="size-4 text-highlight" aria-hidden />
        Prototip modu
      </p>
      <p className="mt-1 text-sm">SMS gönderilmiyor.{current.code ? " Kodun:" : ""}</p>
      {current.code ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="font-mono text-2xl font-extrabold tracking-[0.3em] tabular-nums">{current.code}</span>
          <Button type="button" size="sm" variant="highlight" className="shadow-none" onClick={() => onFill(current.code!)}>
            Kodu doldur
          </Button>
        </div>
      ) : current.done && !isDemoOtpPhone(phone) ? (
        <p className="mt-2 text-sm">
          {"Bu numara için kod gösterilemiyor. Yeni kayıtsan 'Kodu tekrar gönder'e bas; kayıtlı hesabın varsa şimdilik demo numarayla giriş yap."}
        </p>
      ) : current.done ? (
        <div className="mt-2 flex items-center justify-between gap-3 text-sm">
          <span>Kod henüz alınamadı.</span>
          <Button type="button" size="sm" variant="secondary" onClick={() => setRetry((r) => r + 1)}>
            <RotateCw /> Tekrar dene
          </Button>
        </div>
      ) : (
        <p className="mt-2 flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Kod getiriliyor…
        </p>
      )}
    </div>
  );
}
