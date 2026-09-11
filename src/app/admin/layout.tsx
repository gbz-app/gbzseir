import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { IS_ADMIN_SITE } from "@/config/app-mode";
import { requireAdmin } from "@/lib/auth/server";
import { APP_NAME } from "@/config/site";

export const metadata: Metadata = {
  title: { default: "Yönetim", template: `%s | Yönetim | ${APP_NAME}` },
  robots: { index: false, follow: false },
};

/**
 * Admin guard. The panel only exists on the separate admin site (NEXT_PUBLIC_APP_MODE=admin); on the public app it is
 * a 404 (the proxy already rewrites it, this is the second lock). There: only profiles.role = 'admin'.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  if (!IS_ADMIN_SITE) notFound();
  const { profile } = await requireAdmin();
  return <AdminShell adminName={profile.full_name ?? "Yönetici"}>{children}</AdminShell>;
}
