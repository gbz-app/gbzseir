import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/auth/server";
import { APP_NAME } from "@/config/site";

export const metadata: Metadata = {
  title: { default: "Yönetim", template: `%s | Yönetim | ${APP_NAME}` },
  robots: { index: false, follow: false },
};

/** Admin guard: only profiles.role = 'admin'; everyone else gets a 404 (the area is not advertised). */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { profile } = await requireAdmin();
  return <AdminShell adminName={profile.full_name ?? "Yönetici"}>{children}</AdminShell>;
}
