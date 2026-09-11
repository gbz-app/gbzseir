import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { SITE_URL } from "@/config/site";
import { IS_ADMIN_SITE } from "@/config/app-mode";
import { routes } from "@/core/routes";
import { getCurrentUser } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Yetki yok", robots: { index: false, follow: false } };

/** Admin site: a signed-in account without the admin role lands here (sign out and use another number). */
export default async function NoAdminAccessPage() {
  if (!IS_ADMIN_SITE) redirect(routes.home());
  const user = await getCurrentUser();
  if (!user) redirect(routes.auth.login(routes.admin.root()));

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <ShieldAlert className="size-8" aria-hidden />
      </span>
      <h1 className="text-2xl font-extrabold">Bu hesabın yönetici yetkisi yok</h1>
      <p className="max-w-sm text-[15px] leading-relaxed text-muted-foreground">
        Yönetim paneline yalnızca yönetici hesapları girebilir. Çıkış yapıp yönetici numaranla tekrar giriş yap.
      </p>
      <SignOutButton to={routes.auth.login(routes.admin.root())} className="mt-2 w-full max-w-xs" />
      <a href={SITE_URL} className="text-sm font-semibold text-primary hover:underline">
        Uygulamaya git
      </a>
    </div>
  );
}
