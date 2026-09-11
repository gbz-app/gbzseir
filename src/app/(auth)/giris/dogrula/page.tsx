import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VerifyScreen } from "@/features/auth/verify-screen";
import { getCurrentUser, getProfile } from "@/lib/auth/server";
import { getAppSettings } from "@/lib/app-settings";
import { normalizePhoneTR } from "@/core/phone";
import { routes, safeNextPath } from "@/core/routes";

export const metadata: Metadata = {
  title: "Kodu doğrula",
  robots: { index: false, follow: false },
};

export default async function VerifyPage({ searchParams }: PageProps<"/giris/dogrula">) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null);
  const phone = normalizePhoneTR(typeof sp.phone === "string" ? sp.phone : null);
  const user = await getCurrentUser();
  if (user) {
    const profile = await getProfile();
    redirect(profile?.onboarded ? next : routes.auth.profile(next));
  }
  const { otpDemoMode } = await getAppSettings();
  return <VerifyScreen phone={phone} next={next} demoMode={otpDemoMode} />;
}
