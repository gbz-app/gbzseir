import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { routes } from "@/core/routes";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
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
      <PageHeader
        title="İş İlanlarım"
        subtitle={business?.name}
        backHref={routes.profile.root()}
        actions={
          canPost ? (
            <Button asChild size="sm" className="rounded-full">
              <Link href={routes.listings.postJob()}>
                <Plus /> Yeni ilan
              </Link>
            </Button>
          ) : null
        }
      />
      <MyListings rows={rows} type="job" error={error} />
    </>
  );
}
