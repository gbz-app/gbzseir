import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { routes } from "@/core/routes";
import { ProfileHeaderLink, ProfilePageHeader } from "@/components/shared/profile-page-header";
import { requireProfile } from "@/lib/auth/server";
import { getMyListings } from "@/features/listings/server/queries";
import { MyListings } from "@/features/listings/components/my-listings";

export const metadata: Metadata = { title: "İlanlarım", robots: { index: false } };

/** G4 - 2. el ilanlarım. */
export default async function MyClassifiedsPage() {
  const { user } = await requireProfile(routes.profile.listings());
  const { rows, error } = await getMyListings(user.id, "classified");
  return (
    <>
      <ProfilePageHeader
        title="İlanlarım"
        backHref={routes.profile.root()}
        actions={
          <ProfileHeaderLink href={routes.listings.postClassified()} label="Yeni ilan">
            <Plus className="size-5" strokeWidth={2} aria-hidden />
          </ProfileHeaderLink>
        }
      />
      <MyListings rows={rows} type="classified" error={error} />
    </>
  );
}
