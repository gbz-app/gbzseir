import type { Metadata } from "next";
import { routes } from "@/core/routes";
import { PageHeader } from "@/components/shared/page-header";
import { requireProfile } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { NotificationsList, type NotificationItem } from "@/features/profile/components/notifications-list";

export const metadata: Metadata = { title: "Bildirimler", robots: { index: false } };

/** G7 - Bildirimler. */
export default async function NotificationsPage() {
  const { user } = await requireProfile(routes.profile.notifications());
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id,type,title,body,link,read_at,created_at")
    .eq("user_id", user.id)
    // Admin notices (links into the separate admin site) are shown in the admin panel only.
    .or("link.is.null,link.not.like./admin*")
    .order("created_at", { ascending: false })
    .limit(100);
  const items: NotificationItem[] = (data ?? []).map((n) => ({
    id: n.id,
    type: n.type ?? "",
    title: n.title ?? "",
    body: n.body ?? null,
    link: n.link ?? null,
    read_at: n.read_at ?? null,
    created_at: n.created_at,
  }));
  return (
    <>
      <PageHeader title="Bildirimler" backHref={routes.profile.root()} />
      <NotificationsList items={items} />
    </>
  );
}
