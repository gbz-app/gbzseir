import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/server";
import { AdminPageHeader } from "@/components/admin/admin-page";
import { AdminCard } from "@/features/admin/components/admin-ui";
import { ChangePasswordForm } from "@/features/admin/components/change-password-form";

export const metadata: Metadata = { title: "Hesabım ve şifre" };

/** The signed-in admin's own account: who is signed in and the password used on the admin sign-in form. */
export default async function AdminAccountPage() {
  const { profile } = await requireAdmin();
  return (
    <>
      <AdminPageHeader title="Hesabım ve şifre" description="Yönetim paneline telefon numaran ve bu şifreyle girersin." />
      <div className="grid gap-4 lg:grid-cols-2">
        <AdminCard title="Hesap">
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Ad soyad</dt>
              <dd className="font-semibold">{profile.full_name ?? "-"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Telefon</dt>
              <dd className="font-semibold tabular-nums">{profile.phone ?? "-"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Rol</dt>
              <dd className="font-semibold">Yönetici</dd>
            </div>
          </dl>
        </AdminCard>
        <AdminCard title="Şifreyi değiştir" description="Değiştirdikten sonra açık oturumun devam eder; bir sonraki girişte yeni şifreni kullanırsın.">
          <ChangePasswordForm />
        </AdminCard>
      </div>
    </>
  );
}
