"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { OtpForm } from "@/components/auth/otp-form";
import { EmptyState } from "@/components/shared/empty-state";
import { createClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-contract";
import { useAuth } from "@/lib/auth/auth-provider";
import { MARKETING_CONSENT_SESSION_KEY, sendLoginOtp, verifyLoginOtp } from "@/lib/auth/otp";
import { readString, removeItem } from "@/lib/storage";
import { maskPhone } from "@/core/format";
import { routes } from "@/core/routes";
import { AuthStepHeader } from "./auth-step-header";

/**
 * B2 /giris/dogrula: 6-digit code (step 2/3). New users continue to /giris/profil, returning users to `next`.
 * `demoMode` = app_settings.otp_demo_mode (read by the page).
 */
export function VerifyScreen({ phone, next, demoMode }: { phone: string | null; next: string; demoMode?: boolean }) {
  const router = useRouter();
  const { refreshProfile } = useAuth();

  if (!phone) {
    return (
      <EmptyState
        icon={MessageSquareText}
        title="Telefon numarası eksik"
        description="Kod gönderebilmemiz için önce numaranı girmelisin."
        actionLabel="Numaramı gir"
        actionHref={routes.auth.login(next)}
      />
    );
  }

  const onVerify = async (code: string) => {
    const { error, userId } = await verifyLoginOtp(phone, code);
    if (error) return error;
    const supabase = createClient();
    const uid = userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;
    const { data: profile } = uid
      ? await supabase.from(TABLES.profiles).select("onboarded, marketing_consent").eq("id", uid).maybeSingle()
      : { data: null };
    const p = profile as { onboarded?: boolean; marketing_consent?: boolean | null } | null;
    if (p?.onboarded) {
      // Returning user: only ever ADD marketing consent from the login checkbox, never silently revoke it.
      if (uid && readString(MARKETING_CONSENT_SESSION_KEY, "session") === "1" && !p.marketing_consent) {
        await supabase.from(TABLES.profiles).update({ marketing_consent: true }).eq("id", uid);
      }
      removeItem(MARKETING_CONSENT_SESSION_KEY, "session");
      void refreshProfile();
      toast.success("Giriş yapıldı");
      router.replace(next);
      router.refresh();
    } else {
      router.replace(routes.auth.profile(next));
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <AuthStepHeader
        step={2}
        title="Kodu gir"
        description={
          <>
            <span className="font-bold whitespace-nowrap text-foreground tabular-nums">{maskPhone(phone)}</span> numarasına gönderdiğimiz 6 haneli
            kodu yaz.
          </>
        }
      />
      <Link
        href={routes.auth.login(next)}
        replace
        className="-mt-5 mb-4 inline-flex min-h-11 items-center self-start text-sm font-semibold text-primary underline-offset-2 hover:underline"
      >
        Numarayı değiştir
      </Link>

      <OtpForm
        phone={phone}
        demoMode={demoMode}
        onVerify={onVerify}
        onResend={async () => {
          const { error } = await sendLoginOtp(phone);
          return error ?? undefined;
        }}
      />
    </div>
  );
}
