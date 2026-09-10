import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { trCompare } from "@/core/tr";
import { CONTENT_CACHE_TAGS } from "../cache-tags";
import { createPublicClient } from "../server/public-client";
import { toAnnouncementKind, type Announcement } from "./meta";

export const ANNOUNCEMENTS_REVALIDATE_SECONDS = 300;

async function loadAnnouncements(): Promise<Announcement[]> {
  const supabase = createPublicClient();
  // RLS already hides rows whose ends_at has passed.
  const { data, error } = await supabase
    .from("announcements")
    .select("id,kind,title,body,neighbourhood_ids,source_label,starts_at,ends_at,is_demo")
    .order("starts_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  const ids = [...new Set(rows.flatMap((r) => r.neighbourhood_ids ?? []))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: hoods, error: hoodError } = await supabase.from("neighbourhoods").select("id,name").in("id", ids);
    if (hoodError) throw new Error(hoodError.message);
    for (const n of hoods ?? []) names.set(n.id, n.name);
  }

  const now = Date.now();
  return rows
    .filter((r) => !r.ends_at || Date.parse(r.ends_at) > now)
    .map((r) => ({
      id: r.id,
      kind: toAnnouncementKind(r.kind),
      title: r.title,
      body: r.body,
      neighbourhoods: (r.neighbourhood_ids ?? [])
        .filter((id) => names.has(id))
        .map((id) => ({ id, name: names.get(id)! }))
        .sort((a, b) => trCompare(a.name, b.name)),
      sourceLabel: r.source_label,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      isDemo: r.is_demo,
    }));
}

const loadAnnouncementsCached = unstable_cache(loadAnnouncements, ["content-announcements-v1"], {
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
