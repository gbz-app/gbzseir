"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getCurrentUser } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { routes } from "@/core/routes";
import { BUSINESS_CACHE_TAG } from "./lib/cache-tags";

/**
 * Server Action: call after the owner changed their business (page info, photos, hours, vacation mode, review
 * replies, menu, rooms, events). Expires the cached public data so /firma/<slug>, /menu/<slug>, the Keşfet lists and
 * the event pages show the change right away. Only works for a signed-in user who owns a business.
 */
export async function refreshMyBusinessPages(): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const supabase = await createClient();
  const { data } = await supabase.from("businesses").select("slug").eq("owner_id", user.id).limit(1).maybeSingle();
  if (!data) return { ok: false };
  updateTag(BUSINESS_CACHE_TAG);
  revalidatePath(routes.businesses.detail(data.slug));
  revalidatePath(routes.businesses.menu(data.slug));
  revalidatePath(routes.businesses.root());
  revalidatePath("/kesfet/[tur]", "page");
  revalidatePath(routes.events.root());
  revalidatePath("/etkinlik/[slug]", "page");
  return { ok: true };
}
