"use client";

import { useRouter } from "next/navigation";
import { FlaskConical, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhoneForm } from "@/components/auth/phone-form";
import { OTP_DEMO_MODE } from "@/config/site";
import { routes } from "@/core/routes";
import { MARKETING_CONSENT_SESSION_KEY, sendLoginOtp } from "@/lib/auth/otp";
import { canGoBack } from "@/lib/navigation-history";
import { writeString } from "@/lib/storage";

/** B1 /giris: phone number -> SMS code. Login and signup are the same flow. */
export function LoginScreen({ next }: { next: string }) {
  const router = useRouter();

  return (
    <div className="flex flex-1 flex-col pt-4">
      <div className="mb-8">
        <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-primary">
          <Smartphone className="size-7" aria-hidden />
        </div>
        <h1 className="text-[1.75rem] leading-tight font-extrabold text-balance">Telefon numaranla devam et</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Giriş yapmak ya da yeni hesap açmak için numarana 6 haneli bir kod göndereceğiz. Şifre yok.
        </p>
      </div>

      <PhoneForm
        showConsents
        onSubmit={async (phone, { marketingConsent }) => {
          const { error } = await sendLoginOtp(phone);
          if (error) return error;
          writeString(MARKETING_CONSENT_SESSION_KEY, marketingConsent ? "1" : "0", "session");
          router.push(routes.auth.verify(phone, next));
        }}
      />

      {OTP_DEMO_MODE ? (
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-highlight-soft px-3.5 py-2.5 text-xs leading-relaxed text-highlight-foreground dark:text-foreground">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-highlight" aria-hidden />
          <span>
            <strong>Prototip modu:</strong> Gerçek SMS gönderilmez. Kod bir sonraki ekranda gösterilir.
          </span>
        </p>
      ) : null}

      <div className="mt-auto pt-8 text-center">
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => (canGoBack() ? router.back() : router.push(routes.home()))}
        >
          Misafir olarak devam et
        </Button>
      </div>
    </div>
  );
}
