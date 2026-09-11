import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
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
 * Admin-managed vocabularies (2026091351_vocabularies.sql): keşfet chips, amenities, room features and event categories.
 * Public pages read them through the data cache (tag VOCABULARIES_TAG, expired by the admin actions) and fall back to
 * the constants in verticals.ts when the query fails.
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
};

export const DEFAULT_VOCABULARIES: Vocabularies = {
  subcategories: VERTICAL_SUBCATEGORIES,
  amenities: AMENITIES,
  roomAmenities: ROOM_AMENITIES,
  eventCategories: EVENT_CATEGORIES,
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

/** Reads the vocabulary tables with the given client. Throws when a query fails. */
export async function loadVocabularies(client: SupabaseClient<Database>): Promise<Vocabularies> {
  const [s, a, e] = await Promise.all([
    client.from("vertical_subcategories").select("vertical,key,label,keywords,exclude").eq("active", true).order("sort").order("label"),
    client.from("amenities").select("scope,key,label,icon,verticals,active").order("sort").order("label"),
    client.from("event_categories").select("key,label,icon,active").order("sort").order("label"),
  ]);
  const error = s.error ?? a.error ?? e.error;
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
  };
}

const loadPublicVocabularies = unstable_cache(
  () =>
    loadVocabularies(
      createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }),
    ),
  ["business:vocabularies:v1"],
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
