import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { NEWS_CATEGORIES, type NewsCategoryDef } from "@/features/content/articles/meta";
import { PLACE_CATEGORY_DEFS, type PlaceCategoryDef } from "@/features/nearby/config";
import type { CategoryDef } from "./category-visuals";
import {
  AMENITIES,
  EVENT_CATEGORIES,
  ROOM_AMENITIES,
  VERTICAL_SUBCATEGORIES,
  parseVertical,
  type AmenityDef,
  type EventCategoryDef,
  type Vertical,
  type VerticalSubcategory,
} from "./verticals";

/**
 * Admin-managed vocabularies (2026091351_vocabularies.sql, 2026091363_vocab_news_places.sql): keşfet chips, amenities,
 * room features, event, news and place categories. Public pages read them through the data cache (tag
 * VOCABULARIES_TAG, expired by the admin actions) and fall back to the constants (verticals.ts, articles/meta.ts,
 * nearby/config.ts) when the query fails.
 */
export const VOCABULARIES_TAG = "vocabularies";

export type Vocabularies = {
  /** Active chips of each vertical, in order. */
  subcategories: Partial<Record<Vertical, readonly VerticalSubcategory[]>>;
  /** Every amenity / room feature in order; inactive ones are kept, the helpers in verticals.ts skip them. */
  amenities: readonly AmenityDef[];
  roomAmenities: readonly AmenityDef[];
  /** Every event category in order (inactive ones still label older events). */
  eventCategories: readonly EventCategoryDef[];
  /** Every news / place category in order (inactive ones still label older stories and places). */
  newsCategories: readonly NewsCategoryDef[];
  placeCategories: readonly PlaceCategoryDef[];
};

export const DEFAULT_VOCABULARIES: Vocabularies = {
  subcategories: VERTICAL_SUBCATEGORIES,
  amenities: AMENITIES,
  roomAmenities: ROOM_AMENITIES,
  eventCategories: EVENT_CATEGORIES,
  newsCategories: NEWS_CATEGORIES,
  placeCategories: PLACE_CATEGORY_DEFS,
};

const texts = (v: readonly string[] | null) => (v ?? []).filter((x) => x.trim() !== "");

type AmenityRow = Pick<Database["public"]["Tables"]["amenities"]["Row"], "key" | "label" | "icon" | "verticals" | "active">;

function toAmenity(r: AmenityRow): AmenityDef {
  return {
    key: r.key,
    label: r.label,
    icon: r.icon || null,
    verticals: r.verticals.map(parseVertical).filter((v): v is Vertical => !!v),
    active: r.active,
  };
}

type CategoryRow = Pick<Database["public"]["Tables"]["news_categories"]["Row"], "key" | "label" | "icon" | "active">;

/** Category rows in order; the built-in list when the table is empty. */
function toCategories(rows: readonly CategoryRow[] | null, fallback: readonly CategoryDef[]): readonly CategoryDef[] {
  const list = (rows ?? []).map((r) => ({ key: r.key, label: r.label, icon: r.icon || null, active: r.active }));
  return list.length ? list : fallback;
}

/** Reads the vocabulary tables with the given client. Throws when one cannot be read (a thrown read is never cached). */
export async function loadVocabularies(client: SupabaseClient<Database>): Promise<Vocabularies> {
  const [s, a, e, n, p] = await Promise.all([
    client.from("vertical_subcategories").select("vertical,key,label,keywords,exclude").eq("active", true).order("sort").order("label"),
    client.from("amenities").select("scope,key,label,icon,verticals,active").order("sort").order("label"),
    client.from("event_categories").select("key,label,icon,active").order("sort").order("label"),
    client.from("news_categories").select("key,label,icon,active").order("sort").order("label"),
    client.from("place_categories").select("key,label,icon,active").order("sort").order("label"),
  ]);
  const error = s.error ?? a.error ?? e.error ?? n.error ?? p.error;
  if (error) throw new Error(error.message);

  const subcategories: Partial<Record<Vertical, VerticalSubcategory[]>> = {};
  for (const r of s.data ?? []) {
    const v = parseVertical(r.vertical);
    const keywords = texts(r.keywords);
    if (!v || !keywords.length) continue;
    const exclude = texts(r.exclude);
    (subcategories[v] ??= []).push({ key: r.key, label: r.label, keywords, ...(exclude.length ? { exclude } : {}) });
  }
  const amenities = a.data ?? [];
  return {
    subcategories,
    amenities: amenities.filter((r) => r.scope === "business").map(toAmenity),
    roomAmenities: amenities.filter((r) => r.scope === "room").map(toAmenity),
    eventCategories: (e.data ?? []).map((r) => ({ key: r.key, label: r.label, icon: r.icon || null, active: r.active })),
    newsCategories: toCategories(n.data, NEWS_CATEGORIES),
    placeCategories: toCategories(p.data, PLACE_CATEGORY_DEFS),
  };
}

const loadPublicVocabularies = unstable_cache(
  () =>
    loadVocabularies(
      createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }),
    ),
  // v2: news / place categories were added to the cached shape.
  ["business:vocabularies:v2"],
  { revalidate: 3600, tags: [VOCABULARIES_TAG] },
);

/** Vocabularies for public pages (cached, cookie-less); the built-in constants when the database cannot be read. Never throws. */
export const getVocabularies = cache(async (): Promise<Vocabularies> => {
  try {
    return await loadPublicVocabularies();
  } catch (e) {
    console.error("[vocabularies] using the built-in lists:", e instanceof Error ? e.message : e);
    return DEFAULT_VOCABULARIES;
  }
});
