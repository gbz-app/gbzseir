import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { routes } from "@/core/routes";
import { ProfileHeaderLink, ProfilePageHeader } from "@/components/shared/profile-page-header";
import { requireProfile } from "@/lib/auth/server";
import { MyEvents } from "@/features/events/components/my-events";
import { getMyUserEvents } from "@/features/events/owner-queries";

export const metadata: Metadata = { title: "Etkinliklerim", robots: { index: false } };

/** Kendi adına eklediğin etkinlikler: yayında, onay bekleyen, reddedilen, geçmiş. */
export default async function MyEventsPage() {
  const { user } = await requireProfile(routes.profile.events());
  const rows = await getMyUserEvents(user.id).catch(() => null);
  return (
    <>
      <ProfilePageHeader
        title="Etkinliklerim"
        backHref={routes.profile.root()}
        actions={
          <ProfileHeaderLink href={routes.events.create()} label="Etkinlik oluştur">
            <Plus className="size-5" strokeWidth={2} aria-hidden />
          </ProfileHeaderLink>
        }
      />
      <MyEvents rows={rows ?? []} error={!rows} />
    </>
  );
}
