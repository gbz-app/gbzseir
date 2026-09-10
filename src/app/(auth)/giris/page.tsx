import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginScreen } from "@/features/auth/login-screen";
import { getCurrentUser, getProfile } from "@/lib/auth/server";
import { routes, safeNextPath } from "@/core/routes";

export const metadata: Metadata = {
  title: "Giriş yap",
  description: "Telefon numaranla Gebzem'e giriş yap ya da hesap oluştur.",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: PageProps<"/giris">) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null);
  const user = await getCurrentUser();
  if (user) {
    const profile = await getProfile();
    redirect(profile?.onboarded ? next : routes.auth.profile(next));
  }
  return <LoginScreen next={next} />;
}
