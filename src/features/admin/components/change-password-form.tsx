"use client";

import * as React from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MIN_LENGTH = 8;

/** Signed-in admin sets a new password for the phone + password sign-in (Supabase Auth updateUser). */
export function ChangePasswordForm() {
  const [password, setPassword] = React.useState("");
  const [repeat, setRepeat] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_LENGTH) {
      setError(`Şifre en az ${MIN_LENGTH} karakter olmalı.`);
      return;
    }
    if (password !== repeat) {
      setError("Şifreler aynı değil.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(
        updateError.code === "same_password"
          ? "Yeni şifre eskisiyle aynı olamaz."
          : updateError.code === "weak_password"
            ? "Bu şifre çok zayıf. Daha uzun ve tahmin edilmesi zor bir şifre seç."
            : "Şifre değiştirilemedi. Tekrar dene.",
      );
      return;
    }
    setPassword("");
    setRepeat("");
    toast.success("Şifren değişti. Bir sonraki girişte yeni şifreni kullan.");
  };

  return (
    <form onSubmit={submit} noValidate className="flex max-w-sm flex-col gap-4">
      <div>
        <Label htmlFor="new-password" className="mb-1.5 block text-sm font-semibold">
          Yeni şifre
        </Label>
        <div className="relative">
          <Input
            id="new-password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Şifreyi gizle" : "Şifreyi göster"}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">En az {MIN_LENGTH} karakter. Harf, rakam ve işaret karıştırırsan daha güvenli olur.</p>
      </div>
      <div>
        <Label htmlFor="repeat-password" className="mb-1.5 block text-sm font-semibold">
          Yeni şifre (tekrar)
        </Label>
        <Input
          id="repeat-password"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => {
            setRepeat(e.target.value);
            setError(null);
          }}
        />
      </div>
      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy} className="w-fit">
        {busy ? <Loader2 className="animate-spin" /> : null}
        Şifreyi değiştir
      </Button>
    </form>
  );
}
