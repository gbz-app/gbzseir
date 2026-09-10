"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { routes } from "@/core/routes";
import { formatPhoneTR } from "@/core/format";
import { fromSupabasePhone } from "@/core/phone";
import { Button } from "@/components/ui/button";
import { OtpForm } from "@/components/auth/otp-form";
import { PhoneForm } from "@/components/auth/phone-form";
import { useAuth } from "@/lib/auth/auth-provider";
import { sendPhoneChangeOtp, verifyPhoneChangeOtp } from "@/lib/auth/otp";

/** B4 - Telefon numarasını değiştir: new number -> SMS code to the new number -> verified. */
export function PhoneChangeFlow() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const current = fromSupabasePhone(user?.phone ?? null);
  const [phone, setPhone] = React.useState<string | null>(null);

  if (!phone) {
    return (
      <div className="flex flex-col gap-5 px-4 pt-5 pb-8">
        <div>
          <h2 className="text-xl font-bold">Yeni numaranı gir</h2>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
            {current ? <>Şu anki numaran {formatPhoneTR(current)}. </> : null}
            Yeni numarana bir doğrulama kodu göndereceğiz. Girişlerde artık yeni numaranı kullanacaksın.
          </p>
        </div>
        <PhoneForm
          label="Yeni cep telefonu"
          submitLabel="Kod Gönder"
          onSubmit={async (p) => {
            if (current && p === current) return "Bu zaten kayıtlı numaran.";
            const { error } = await sendPhoneChangeOtp(p);
            if (error) return error;
            setPhone(p);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 px-4 pt-5 pb-8">
      <div>
        <h2 className="text-xl font-bold">Kodu gir</h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{formatPhoneTR(phone)} numarasına gönderilen 6 haneli kodu gir.</p>
        <Button variant="link" className="h-auto px-0" onClick={() => setPhone(null)}>
          Numarayı değiştir
        </Button>
      </div>
      <OtpForm
        phone={phone}
        onVerify={async (code) => {
          const { error } = await verifyPhoneChangeOtp(phone, code);
          if (error) return error;
          await refreshProfile();
          toast.success("Telefon numaran güncellendi");
          router.replace(routes.profile.settings());
          router.refresh();
        }}
        onResend={async () => {
          const { error } = await sendPhoneChangeOtp(phone);
          if (error) return error;
        }}
      />
    </div>
  );
}
