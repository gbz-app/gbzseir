import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { routes } from "@/core/routes";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
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
      <PageHeader
        title="İlanlarım"
        backHref={routes.profile.root()}
        actions={
          <Button asChild size="sm" className="rounded-full">
            <Link href={routes.listings.postClassified()}>
              <Plus /> Yeni ilan
            </Link>
          </Button>
        }
      />
      <MyListings rows={rows} type="classified" error={error} />
    </>
  );
}
