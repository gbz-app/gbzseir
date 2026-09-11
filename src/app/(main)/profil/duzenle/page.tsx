import type { Metadata } from "next";
import { routes } from "@/core/routes";
import { fromSupabasePhone } from "@/core/phone";
import { ProfilePageHeader } from "@/components/shared/profile-page-header";
import { requireProfile } from "@/lib/auth/server";
import { ProfileEditForm } from "@/features/profile/components/profile-edit-form";

export const metadata: Metadata = { title: "Kişisel Bilgiler", robots: { index: false } };

/** G3 - Kişisel bilgiler (profili düzenle). */
export default async function EditProfilePage() {
  const { user, profile } = await requireProfile(routes.profile.edit());
  return (
    <>
      <ProfilePageHeader title="Kişisel bilgiler" backHref={routes.profile.root()} />
      <ProfileEditForm
        initial={{
          fullName: profile.full_name,
          email: profile.email,
          neighbourhoodId: profile.neighbourhood_id != null ? String(profile.neighbourhood_id) : null,
          avatarUrl: profile.avatar_url,
          phone: fromSupabasePhone(user.phone ?? profile.phone ?? null),
        }}
      />
    </>
  );
}
