"use client";

import * as React from "react";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { digitsOnly, formatPhoneInputTR, isValidTRMobile, normalizePhoneTR } from "@/core/phone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** Admin site sign-in: phone + password (no SMS code, no consent boxes). Only admin accounts get through. */
export function AdminLoginForm({ next }: { next: string }) {
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const national = digitsOnly(phone);
    if (!isValidTRMobile(national)) {
      setError("Geçerli bir cep telefonu numarası yaz (5XX XXX XX XX).");
      return;
    }
    if (!password) {
      setError("Şifreni yaz.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ phone: normalizePhoneTR(national)!, password });
    if (signInError || !data.user) {
      setBusy(false);
      setError(signInError?.status === 429 ? "Çok fazla deneme yaptın. Birkaç dakika sonra tekrar dene." : "Telefon numarası ya da şifre hatalı.");
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    if (profile?.role !== "admin") {
      await supabase.auth.signOut();
      setBusy(false);
      setError("Bu hesabın yönetici yetkisi yok.");
      return;
    }
    // Full load so the server sees the new session cookie.
    window.location.assign(next);
  };

  return (
    <div className="flex flex-1 flex-col pt-6">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-primary">
        <ShieldCheck className="size-7" aria-hidden />
      </span>
      <h1 className="mt-5 text-[28px] leading-tight font-extrabold tracking-tight">Yönetim paneline giriş</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">Yönetici telefon numaran ve şifrenle giriş yap.</p>

      <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-5">
        <div>
          <Label htmlFor="admin-phone" className="mb-2 block text-sm font-semibold">
            Cep telefonu
          </Label>
          <div className="flex h-14 items-center overflow-hidden rounded-2xl border border-input bg-card transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <span className="flex h-full items-center border-r bg-muted/60 px-4 text-lg font-bold text-muted-foreground select-none" aria-hidden>
              +90
            </span>
            <input
              id="admin-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              autoFocus
              placeholder="5XX XXX XX XX"
              value={phone}
              maxLength={13}
              onChange={(e) => {
                setPhone(formatPhoneInputTR(e.target.value));
                setError(null);
              }}
              className="h-full min-w-0 flex-1 bg-transparent px-4 text-lg font-semibold tracking-wide tabular-nums outline-none placeholder:font-normal placeholder:text-muted-foreground/70"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="admin-password" className="mb-2 block text-sm font-semibold">
            Şifre
          </Label>
          <div className="flex h-14 items-center overflow-hidden rounded-2xl border border-input bg-card transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <input
              id="admin-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              className="h-full min-w-0 flex-1 bg-transparent px-4 text-lg font-semibold outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
              className="flex size-12 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
            </button>
          </div>
        </div>

        {error ? (
          <p role="alert" className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" className={cn("h-13 w-full text-base")} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Giriş yap
        </Button>
      </form>
    </div>
  );
}
