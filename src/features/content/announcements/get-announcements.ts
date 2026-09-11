import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { KOCAELI_DISTRICTS } from "@/config/districts";
import { CONTENT_CACHE_TAGS } from "../cache-tags";
import { createPublicClient } from "../server/public-client";
import { toAnnouncementKind, type Announcement } from "./meta";

export const ANNOUNCEMENTS_REVALIDATE_SECONDS = 300;

async function loadAnnouncements(): Promise<Announcement[]> {
  const supabase = createPublicClient();
  // RLS already hides rows whose ends_at has passed.
  const { data, error } = await supabase
    .from("announcements")
    .select("id,kind,title,body,district_ids,source_label,starts_at,ends_at,is_demo")
    .order("starts_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  const now = Date.now();
  return rows
    .filter((r) => !r.ends_at || Date.parse(r.ends_at) > now)
    .map((r) => ({
      id: r.id,
      kind: toAnnouncementKind(r.kind),
      title: r.title,
      body: r.body,
      // Static district list (no lookup query), in display order.
      districts: KOCAELI_DISTRICTS.filter((d) => (r.district_ids ?? []).includes(d.slug)).map((d) => ({ id: d.slug, name: d.name })),
      sourceLabel: r.source_label,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      isDemo: r.is_demo,
    }));
}

// v2: districts replaced neighbourhoods in the cached shape.
const loadAnnouncementsCached = unstable_cache(loadAnnouncements, ["content-announcements-v2"], {
  revalidate: ANNOUNCEMENTS_REVALIDATE_SECONDS,
  tags: [CONTENT_CACHE_TAGS.announcements],
});

export type AnnouncementsResult = {
  items: Announcement[];
  failed: boolean;
  /** Server render time (ms). Client components hydrate their clock with it, then re-check expiry. */
  renderedAt: number;
};

/** Active announcements (not ended). Never throws. */
export const getActiveAnnouncements = cache(async (): Promise<AnnouncementsResult> => {
  const renderedAt = Date.now();
  try {
    return { items: await loadAnnouncementsCached(), failed: false, renderedAt };
  } catch {
    return { items: [], failed: true, renderedAt };
  }
});
