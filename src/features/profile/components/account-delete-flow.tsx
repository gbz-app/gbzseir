"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatPhoneTR } from "@/core/format";
import { fromSupabasePhone } from "@/core/phone";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { OtpForm } from "@/components/auth/otp-form";
import { useAuth } from "@/lib/auth/auth-provider";
import { sendLoginOtp, verifyLoginOtp } from "@/lib/auth/otp";
import { createClient } from "@/lib/supabase/client";
import { removeAllUserFiles } from "../lib/storage-cleanup";

const WHAT_IS_DELETED = [
  "Tüm ilanların ve iş ilanların yayından kalkar ve silinir.",
  "İşletme hesabın ve işletme sayfan kapatılır.",
  "Hizmet taleplerin anonim hale getirilir.",
  "Yüklediğin tüm fotoğraflar ve belgeler silinir.",
  "Favorilerin ve bildirimlerin silinir.",
];

/** G9 - Hesabı sil: explanation -> SMS code to the current phone -> files + account deleted. */
export function AccountDeleteFlow() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const phone = fromSupabasePhone(user?.phone ?? null);
  const [agreed, setAgreed] = React.useState(false);
  const [stage, setStage] = React.useState<"info" | "otp" | "deleting">("info");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const sendCode = async () => {
    if (!phone) return;
    setSending(true);
    setError(null);
    const { error: sendError } = await sendLoginOtp(phone);
    setSending(false);
    if (sendError) setError(sendError);
    else setStage("otp");
  };

  if (stage === "deleting") {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center" role="status">
        <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
        <p className="font-semibold">Hesabın siliniyor…</p>
        <p className="text-sm text-muted-foreground">Bu birkaç saniye sürebilir, sayfayı kapatma.</p>
      </div>
    );
  }

  if (stage === "otp" && phone) {
    return (
      <div className="flex flex-col gap-5 px-4 pt-5 pb-8">
        <div>
          <h2 className="text-xl font-bold">Son adım: kodu gir</h2>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
            {formatPhoneTR(phone)} numarasına gönderilen kodu girince hesabın kalıcı olarak silinecek.
          </p>
        </div>
        <OtpForm
          phone={phone}
          submitLabel="Hesabımı sil"
          onVerify={async (code) => {
            const { error: verifyError, userId } = await verifyLoginOtp(phone, code);
            if (verifyError) return verifyError;
            const uid = userId ?? user?.id;
            if (!uid) return "Oturum doğrulanamadı. Lütfen tekrar dene.";
            setStage("deleting");
            await removeAllUserFiles(uid);
            const { error: rpcError } = await createClient().rpc("delete_my_account");
            if (rpcError) {
              setStage("info");
              setError(rpcError.message || "Hesap silinemedi. Lütfen tekrar dene.");
              return;
            }
            await signOut();
            toast.success("Hesabın silindi. Seni özleyeceğiz.");
            router.replace("/");
            router.refresh();
          }}
          onResend={async () => {
            const { error: sendError } = await sendLoginOtp(phone);
            if (sendError) return sendError;
          }}
        />
        <Button variant="ghost" onClick={() => setStage("info")}>
          Vazgeç
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 px-4 pt-5 pb-8">
      <div className="flex gap-3 rounded-2xl bg-destructive/10 p-4 ring-1 ring-destructive/20">
        <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div className="text-sm leading-relaxed">
          <p className="font-bold text-destructive">Bu işlem geri alınamaz</p>
          <p className="mt-0.5 text-muted-foreground">Hesabını silersen aşağıdakiler kalıcı olarak kaybolur.</p>
        </div>
      </div>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-[15px] leading-relaxed">
        {WHAT_IS_DELETED.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <label htmlFor="silme-onay" className="flex items-start gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/[0.08]">
        <Checkbox id="silme-onay" checked={agreed} onCheckedChange={(c) => setAgreed(c === true)} className="mt-0.5" />
        <span className="text-[15px] leading-snug">Okudum, hesabımın ve verilerimin silinmesini istiyorum.</span>
      </label>
      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button variant="destructive" size="lg" disabled={!agreed || !phone || sending} onClick={sendCode}>
        {sending ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Doğrulama kodu gönder
      </Button>
      <p className="text-center text-xs text-muted-foreground">Güvenliğin için silme işlemini telefonuna gelen kodla onaylaman gerekiyor.</p>
    </div>
  );
}
