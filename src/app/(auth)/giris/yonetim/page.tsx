import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IS_ADMIN_SITE } from "@/config/app-mode";
import { safeNextPath } from "@/core/routes";
import { getCurrentUser, getProfile } from "@/lib/auth/server";
import { Button } from "@/components/ui/button";
import { AdminLoginForm } from "@/features/admin/components/admin-login-form";

export const metadata: Metadata = { title: "Yönetim girişi", robots: { index: false, follow: false } };

/**
 * Admin site sign-in (phone + password). src/proxy.ts shows it at /admin/* for guests, so the address stays /admin.
 * Never redirects to /admin itself (the proxy and this page could disagree about the session and loop).
 */
export default async function AdminLoginPage({ searchParams }: PageProps<"/giris/yonetim">) {
  if (!IS_ADMIN_SITE) notFound();
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null);
  const user = await getCurrentUser();
  const profile = user ? await getProfile() : null;

  if (profile?.role === "admin") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-2xl font-extrabold">Zaten giriş yaptın</h1>
        <Button asChild size="lg" className="w-full max-w-xs">
          <Link href={next}>Panele git</Link>
        </Button>
      </div>
    );
  }
  return <AdminLoginForm next={next} />;
}
