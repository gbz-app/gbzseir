import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { routes } from "@/core/routes";
import { ProfileHeaderLink, ProfilePageHeader } from "@/components/shared/profile-page-header";
import { requireProfile } from "@/lib/auth/server";
import { getMyBusiness, getMyListings } from "@/features/listings/server/queries";
import { MyListings } from "@/features/listings/components/my-listings";

export const metadata: Metadata = { title: "İş İlanlarım", robots: { index: false } };

/** G4 - İş ilanlarım (işletme adına verilen ilanlar). */
export default async function MyJobsPage() {
  const { user } = await requireProfile(routes.profile.jobs());
  const [{ rows, error }, business] = await Promise.all([getMyListings(user.id, "job"), getMyBusiness(user.id)]);
  const canPost = business?.status === "approved";
  return (
    <>
      <ProfilePageHeader
        title="İş ilanlarım"
        subtitle={business?.name}
        backHref={routes.profile.root()}
        actions={
          canPost ? (
            <ProfileHeaderLink href={routes.listings.postJob()} label="Yeni iş ilanı">
              <Plus className="size-5" strokeWidth={2} aria-hidden />
            </ProfileHeaderLink>
          ) : null
        }
      />
      <MyListings rows={rows} type="job" error={error} />
    </>
  );
}
