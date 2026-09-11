import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileSetupScreen } from "@/features/auth/profile-setup-screen";
import { getCurrentUser, getProfile } from "@/lib/auth/server";
import { routes, safeNextPath } from "@/core/routes";

export const metadata: Metadata = {
  title: "Profilini tamamla",
  robots: { index: false, follow: false },
};

export default async function ProfileSetupPage({ searchParams }: PageProps<"/giris/profil">) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null);
  const user = await getCurrentUser();
  if (!user) redirect(routes.auth.login(next));
  const profile = await getProfile();
  if (profile?.onboarded) redirect(next);
  return <ProfileSetupScreen next={next} initial={{ fullName: profile?.full_name ?? null, avatarUrl: profile?.avatar_url ?? null }} />;
}
